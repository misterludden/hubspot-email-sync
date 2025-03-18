const { google } = require("googleapis");
const { authenticateGoogle, SCOPES } = require("../config.js");
const Token = require("../models/Token");
const Email = require("../models/Email");
const EmailService = require("./emailService");

class GmailService extends EmailService {
  constructor() {
    super();
    this.syncCompleted = false;
    this.providerName = 'gmail';
    
    // Validate required environment variables
    const requiredVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];
    requiredVars.forEach(varName => {
      if (!process.env[varName]) {
        throw new Error(`${varName} environment variable is required for Gmail integration`);
      }
    });
  }

  /**
   * Generate an authentication URL for Gmail
   * @returns {Promise<string>} The authentication URL
   */
  async generateAuthUrl() {
    try {
      const oauth2Client = await authenticateGoogle();
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent",
      });
      return { url: authUrl };
    } catch (error) {
      throw new Error(`Failed to generate authentication URL: ${error.message}`);
    }
  }

  /**
   * Handle the OAuth callback and retrieve tokens
   * @param {string} code - The authorization code from the OAuth callback
   * @returns {Promise<Object>} The user information and tokens
   */
  async handleCallback(code) {
    try {
      const oauth2Client = await authenticateGoogle();
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
      const userInfo = await oauth2.userinfo.get();
      const userEmail = userInfo.data.email;

      // Store tokens with provider information
      const tokenDoc = await Token.findOneAndUpdate(
        { userEmail, provider: this.providerName },
        { 
          userEmail, 
          provider: this.providerName, 
          tokens, 
          updatedAt: new Date(),
          isValid: true
        },
        { upsert: true, new: true }
      );

      return { userEmail, success: true };
    } catch (error) {
      throw new Error(`OAuth authentication failed: ${error.message}`);
    }
  }

  /**
   * Check the authentication status for a user
   * @param {string} userEmail - The user's email address
   * @returns {Promise<Object>} The authentication status
   */
  async checkAuthStatus(userEmail) {
    try {
      if (!userEmail) {
        return { authenticated: false, message: "No email provided." };
      }

      const storedTokenDoc = await Token.findOne({ 
        userEmail, 
        provider: this.getProviderName() 
      });
      
      if (!storedTokenDoc || !storedTokenDoc.tokens) {
        return { authenticated: false };
      }

      const storedTokens = storedTokenDoc.tokens;
      const oauth2Client = await authenticateGoogle();
      oauth2Client.setCredentials(storedTokens);

      // Check if token is expired or will expire soon (within 5 minutes)
      const tokenExpiryTime = storedTokens.expiry_date ? new Date(storedTokens.expiry_date) : null;
      const currentTime = new Date();
      const fiveMinutesFromNow = new Date(currentTime.getTime() + 5 * 60 * 1000);
      
      const tokenExpiredOrExpiringSoon = tokenExpiryTime && tokenExpiryTime < fiveMinutesFromNow;
      
      // Refresh token if expired or expiring soon
      if (tokenExpiredOrExpiringSoon && storedTokens.refresh_token) {
        try {
          console.log(`Token expired or expiring soon for ${userEmail}, refreshing...`);
          const { credentials } = await oauth2Client.refreshAccessToken();
          
          // Ensure we preserve the refresh token if it's not in the new credentials
          if (!credentials.refresh_token && storedTokens.refresh_token) {
            credentials.refresh_token = storedTokens.refresh_token;
          }
          
          oauth2Client.setCredentials(credentials);

          // Update the stored tokens
          await Token.findOneAndUpdate(
            { userEmail, provider: this.getProviderName() }, 
            { tokens: credentials, updatedAt: new Date(), isValid: true }
          );
          
          console.log(`Successfully refreshed token for ${userEmail}`);
        } catch (refreshError) {
          console.error(`Error refreshing token for ${userEmail}:`, refreshError);
          // Don't immediately invalidate the token - try to use it anyway
          // Only mark as invalid if we can't use it at all
        }
      }

      // Try to verify authentication with a lightweight API call
      try {
        const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
        const userInfo = await oauth2.userinfo.get();
        return { authenticated: true, email: userInfo.data.email };
      } catch (apiError) {
        console.error(`API call failed for ${userEmail}:`, apiError);
        
        // Only invalidate the token if it's an authentication error
        if (apiError.code === 401 || apiError.response?.status === 401) {
          await Token.findOneAndUpdate(
            { userEmail, provider: this.getProviderName() },
            { isValid: false }
          );
          return { authenticated: false };
        }
        
        // For other errors, assume the token is still valid
        // This prevents unnecessary re-authentication for temporary API issues
        return { authenticated: true, email: userEmail };
      }
    } catch (error) {
      console.error("Error in auth status check:", error);
      return { authenticated: false };
    }
  }

  /**
   * Disconnect a user from Gmail
   * @param {string} userEmail - The user's email address
   * @returns {Promise<boolean>} Success status
   */
  async disconnect(userEmail) {
    try {
      await Token.deleteOne({ userEmail, provider: this.getProviderName() });
      return { success: true, message: "Disconnected successfully" };
    } catch (error) {
      throw new Error(`Error disconnecting user: ${error.message}`);
    }
  }

  /**
   * Get an authenticated Gmail client
   * @param {string} userEmail - The user's email address
   * @returns {Promise<Object>} The Gmail client
   * @private
   */
  async _getAuthenticatedClient(userEmail) {
    const tokenDoc = await Token.findOne({ userEmail, provider: this.getProviderName() });
    if (!tokenDoc || !tokenDoc.tokens) {
      throw new Error("OAuth tokens missing. Please reconnect your account.");
    }
    
    if (!tokenDoc.isValid) {
      throw new Error("OAuth token is invalid. Please reconnect your account.");
    }

    const storedTokens = tokenDoc.tokens;
    const oauth2Client = await authenticateGoogle();
    oauth2Client.setCredentials(storedTokens);

    // Check if token is expired or will expire soon (within 5 minutes)
    const tokenExpiryTime = storedTokens.expiry_date ? new Date(storedTokens.expiry_date) : null;
    const currentTime = new Date();
    const fiveMinutesFromNow = new Date(currentTime.getTime() + 5 * 60 * 1000);
    
    const tokenExpiredOrExpiringSoon = tokenExpiryTime && tokenExpiryTime < fiveMinutesFromNow;
    
    // Refresh token if expired or expiring soon
    if (tokenExpiredOrExpiringSoon && storedTokens.refresh_token) {
      try {
        console.log(`Token expired or expiring soon for ${userEmail}, refreshing...`);
        const { credentials } = await oauth2Client.refreshAccessToken();
        
        // Ensure we preserve the refresh token if it's not in the new credentials
        if (!credentials.refresh_token && storedTokens.refresh_token) {
          credentials.refresh_token = storedTokens.refresh_token;
        }
        
        oauth2Client.setCredentials(credentials);

        // Update the stored tokens
        await Token.findOneAndUpdate(
          { userEmail, provider: this.getProviderName() }, 
          { tokens: credentials, updatedAt: new Date(), isValid: true }
        );
        
        console.log(`Successfully refreshed token for ${userEmail}`);
      } catch (refreshError) {
        console.error(`Error refreshing token for ${userEmail}:`, refreshError);
        // Continue with the existing token and hope it works
      }
    }

    return google.gmail({ version: "v1", auth: oauth2Client });
  }

  /**
   * Sync emails from Gmail
   * @param {string} userEmail - The user's email address
   * @param {Object} options - Sync options (e.g., days)
   * @returns {Promise<Object>} Sync results
   */
  async syncEmails(userEmail, options = {}) {
    try {
      if (!userEmail) {
        throw new Error("User email is required for sync.");
      }

      const gmail = await this._getAuthenticatedClient(userEmail);
      
      const days = options.days || 1;
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);
      
      // Build the query based on options
      // For regular polling, we want to get ALL recent messages regardless of date
      // This ensures we don't miss any messages due to timestamp issues
      let query = "";
      
      if (options.forceFull) {
        // For a full sync, get everything including archived messages
        // But still respect the date filter
        query = `after:${Math.floor(sinceDate.getTime() / 1000)} in:anywhere`;
      } else if (options.polling) {
        // For polling, we need to check if this is the first poll after being away
        // Get the last sync time from the token document
        const tokenDoc = await Token.findOne({ userEmail, provider: this.getProviderName() });
        const lastSyncTime = tokenDoc?.lastSyncTime || null;
        const now = new Date();
        
        // Calculate time window based on last sync
        let timeWindow;
        if (!lastSyncTime) {
          // If no last sync time, get messages from the last 24 hours
          timeWindow = new Date(now);
          timeWindow.setHours(timeWindow.getHours() - 24);
          console.log(`No previous sync time found, getting messages from last 24 hours`);
        } else {
          // Calculate time since last sync
          const timeSinceLastSync = now.getTime() - new Date(lastSyncTime).getTime();
          const minutesSinceLastSync = Math.floor(timeSinceLastSync / (1000 * 60));
          
          if (minutesSinceLastSync > 60) {
            // If more than 60 minutes since last sync, get messages since last sync minus 10 minutes buffer
            // The buffer helps ensure we don't miss any messages due to clock differences
            timeWindow = new Date(lastSyncTime);
            timeWindow.setMinutes(timeWindow.getMinutes() - 10); // Add 10-minute buffer
            console.log(`Been away for ${minutesSinceLastSync} minutes, getting messages since last sync with buffer`);
          } else {
            // For regular polling (within 60 minutes), use last 15 minutes
            timeWindow = new Date(now);
            timeWindow.setMinutes(timeWindow.getMinutes() - 15);
            console.log(`Regular polling, getting messages from last 15 minutes`);
          }
        }
        
        // Use after: parameter with the calculated time window
        // Include all messages regardless of folder to ensure we catch everything
        query = `after:${Math.floor(timeWindow.getTime() / 1000)} in:anywhere`;
        console.log(`Polling for messages after: ${timeWindow.toISOString()}`);
      } else {
        // For regular background sync, get recent messages from the last hour
        const oneHourAgo = new Date();
        oneHourAgo.setHours(oneHourAgo.getHours() - 1);
        
        // Use after: parameter to get messages from the last hour
        // Include inbox, sent, and any messages to/from the user
        query = `after:${Math.floor(oneHourAgo.getTime() / 1000)} (in:inbox OR in:sent OR from:me OR to:me)`;
      }

      console.log(`Fetching messages for ${userEmail} from Gmail API with query: ${query}`);
      const messagesResponse = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: options.forceFull ? 500 : 250, // Increased for regular polling to ensure we catch all messages
      });

      const messages = messagesResponse.data.messages || [];
      console.log(`Processing ${messages.length} messages...`);
      
      // Update the last sync time in the token document
      await Token.findOneAndUpdate(
        { userEmail, provider: this.getProviderName() },
        { lastSyncTime: new Date() }
      );

      if (messages.length === 0) {
        this.syncCompleted = true;
        return { success: true, message: "No messages found for sync." };
      }

      const messageDetails = await Promise.all(
        messages.map(async (msg) => {
          try {
            if (!msg.id || !msg.threadId) {
              console.warn("Skipping message with missing messageId or threadId:", msg);
              return null;
            }

            // Get full message details including the body content
            const msgDetail = await gmail.users.messages.get({ 
              userId: "me", 
              id: msg.id,
              format: "full" // Request full message format to get complete body content
            });
            
            const headers = msgDetail.data.payload.headers;
            const getHeader = (name) => headers.find((header) => header.name === name)?.value || "";
            
            // Extract the full HTML content from the message payload
            let fullHtmlContent = "";
            let plainTextContent = "";
            
            // Helper function to decode base64 content
            const decodeBase64 = (encoded) => {
              try {
                // Handle URL-safe base64 encoding by replacing - with + and _ with /
                const sanitized = encoded.replace(/-/g, '+').replace(/_/g, '/');
                return Buffer.from(sanitized, 'base64').toString('utf8');
              } catch (error) {
                console.error('Error decoding base64 content:', error);
                return '';
              }
            };
            
            // Function to extract message content from parts recursively
            const extractContent = (part) => {
              if (part.mimeType === 'text/html' && part.body && part.body.data) {
                fullHtmlContent = decodeBase64(part.body.data);
              } else if (part.mimeType === 'text/plain' && part.body && part.body.data) {
                plainTextContent = decodeBase64(part.body.data);
              } else if (part.parts && part.parts.length) {
                // Recursively process multipart messages
                part.parts.forEach(subpart => extractContent(subpart));
              }
            };
            
            // Process the message payload to extract content
            if (msgDetail.data.payload) {
              extractContent(msgDetail.data.payload);
            }
            
            // Use HTML content if available, otherwise use plain text or snippet
            const bodyContent = fullHtmlContent || plainTextContent || msgDetail.data.snippet;
            
            const messageObj = {
              messageId: msgDetail.data.id,
              threadId: msgDetail.data.threadId,
              sender: getHeader("From"),
              recipient: getHeader("To"),
              subject: getHeader("Subject"),
              body: bodyContent, // Use the full content instead of just the snippet
              snippet: msgDetail.data.snippet || '', // Store the snippet directly from Gmail API
              bodyType: fullHtmlContent ? 'html' : (plainTextContent ? 'text' : 'snippet'),
              timestamp: new Date(parseInt(msgDetail.data.internalDate)).toISOString(),
              // Improved check for inbound messages - handles various email formats
              isInbound: !getHeader("From").toLowerCase().includes(userEmail.toLowerCase()),
              isRead: !msgDetail.data.labelIds.includes("UNREAD"), // Check Gmail API labels
              provider: this.getProviderName(),
            };

            if (!messageObj.messageId) {
              console.warn("Skipping message due to missing messageId:", messageObj);
              return null;
            }

            return messageObj;
          } catch (error) {
            console.error("Error processing message: ", error);
            return null;
          }
        })
      );

      // Ensure valid messages are assigned properly before inserting into DB
      const validMessages = messageDetails.filter((msg) => msg !== null && msg.messageId);
      console.log(`Valid messages to insert: ${validMessages.length}`);

      for (const message of validMessages) {
        console.log(`Processing message: ${message.messageId} | Subject: ${message.subject}`);

        try {
          // First check if the thread exists
          const existingThread = await Email.findOne({
            threadId: message.threadId,
            provider: this.getProviderName(),
            userEmail: userEmail.toLowerCase()
          });
          
          if (existingThread) {
            // Check if this message already exists in the thread
            const messageExists = existingThread.messages.some(msg => msg.messageId === message.messageId);
            
            if (!messageExists) {
              // Add the new message to the existing thread
              const result = await Email.findOneAndUpdate(
                { _id: existingThread._id },
                {
                  $push: { messages: message },
                  $addToSet: {
                    participants: { $each: [message.sender, message.recipient].filter(p => p) }
                  },
                  $set: { 
                    // Only update timestamp if this message is newer
                    latestTimestamp: new Date(message.timestamp) > new Date(existingThread.latestTimestamp) 
                      ? message.timestamp 
                      : existingThread.latestTimestamp
                  }
                },
                { new: true }
              );
              console.log(`Added new message ${message.messageId} to existing thread ${message.threadId}`);
            } else {
              // If message exists but we're doing a force sync, update its read status
              if (options.forceFull) {
                await Email.updateOne(
                  { 
                    _id: existingThread._id,
                    "messages.messageId": message.messageId 
                  },
                  {
                    $set: { "messages.$.isRead": message.isRead }
                  }
                );
                console.log(`Updated read status for message ${message.messageId}`);
              } else {
                console.log(`Message ${message.messageId} already exists in thread. Skipping.`);
              }
            }
          } else {
            // Create a new thread with this message
            const newThread = new Email({
              threadId: message.threadId,
              subject: message.subject,
              provider: this.getProviderName(),
              userEmail: userEmail.toLowerCase(),
              participants: [message.sender, message.recipient].filter(p => p),
              messages: [message],
              latestTimestamp: message.timestamp
            });
            
            await newThread.save();
            console.log(`Created new thread for message ${message.messageId}`);
          }
          
          console.log(`Saved message: ${message.messageId} | Subject: ${message.subject}`);
        } catch (error) {
          // If we still get an error, try a different approach
          if (error.code === 11000) {
            console.log(`Duplicate key error for message: ${message.messageId}. Using alternative approach.`);
            
            // First check if the message already exists
            const existingWithMessage = await Email.findOne({
              threadId: message.threadId,
              provider: this.getProviderName(),
              userEmail: userEmail.toLowerCase(),
              "messages.messageId": message.messageId
            });
            
            if (existingWithMessage) {
              console.log(`Message ${message.messageId} already exists in thread. Skipping.`);
              continue;
            }
            
            // Get the existing thread
            const existingThread = await Email.findOne({
              threadId: message.threadId,
              provider: this.getProviderName(),
              userEmail: userEmail.toLowerCase()
            });
            
            if (existingThread) {
              // Add message to existing thread
              existingThread.messages.push(message);
              
              // Update timestamp if needed
              if (new Date(message.timestamp) > new Date(existingThread.latestTimestamp)) {
                existingThread.latestTimestamp = new Date(message.timestamp);
              }
              
              // Update participants
              if (message.sender) existingThread.participants.push(message.sender);
              if (message.recipient) existingThread.participants.push(message.recipient);
              existingThread.participants = [...new Set(existingThread.participants)];
              
              // Save changes
              await existingThread.save();
              console.log(`Added message ${message.messageId} to existing thread using fallback method`);
            } else {
              // Create a completely new thread as a last resort
              console.log(`Creating new thread for ${message.messageId} as last resort`);
              const newThread = new Email({
                threadId: message.threadId,
                subject: message.subject,
                provider: this.getProviderName(),
                userEmail: userEmail.toLowerCase(),
                participants: [message.sender, message.recipient].filter(p => p),
                messages: [message],
                latestTimestamp: new Date(message.timestamp)
              });
              
              try {
                await newThread.save();
                console.log(`Created new thread for message ${message.messageId} using last resort method`);
              } catch (finalError) {
                console.error(`Failed to save message ${message.messageId} after multiple attempts:`, finalError);
              }
            }
          } else {
            console.error(`Error processing message ${message.messageId}:`, error);
          }
        }
      }

      this.syncCompleted = true;
      return { success: true, message: "Inbox sync completed successfully." };
    } catch (error) {
      console.error("Error syncing inbox:", error);
      throw new Error(`Inbox sync failed: ${error.message}`);
    }
  }

  /**
   * Check the sync status
   * @returns {Promise<Object>} The sync status
   */
  async getSyncStatus() {
    return { success: true, synced: this.syncCompleted };
  }

  /**
   * Send an email via Gmail
   * @param {string} userEmail - The sender's email address
   * @param {Object} emailData - The email data (recipient, subject, body, emailId)
   * @returns {Promise<Object>} Send results
   */
  async sendEmail(userEmail, emailData) {
    try {
      const gmail = await this._getAuthenticatedClient(userEmail);
      
      const { recipient, subject, body } = emailData;
      const emailContent = `To: ${recipient}\nSubject: ${subject}\nContent-Type: text/plain; charset="UTF-8"\n\n${body}`;
      const encodedMessage = Buffer.from(emailContent).toString("base64");

      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodedMessage },
      });

      if (!response.data || !response.data.id) {
        throw new Error("Failed to send email: No message ID received");
      }

      return { success: true, messageId: response.data.id };
    } catch (error) {
      console.error("Error sending email:", error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Reply to an email thread via Gmail
   * @param {string} userEmail - The sender's email address
   * @param {Object} replyData - The reply data (threadId, body)
   * @returns {Promise<Object>} Reply results with updated thread
   */
  /**
   * Reply to an email thread via Gmail
   * @param {string} userEmail - The sender's email address
   * @param {Object} replyData - The reply data (threadId, body)
   * @returns {Promise<Object>} Reply results with updated thread
   */
  async replyToEmail(userEmail, replyData) {
    try {
      const gmail = await this._getAuthenticatedClient(userEmail);
      const { threadId, body, isHtml = false, attachments = [] } = replyData;

      // Get the original thread to properly format the reply
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
      });

      if (!thread.data || !thread.data.messages || thread.data.messages.length === 0) {
        throw new Error("Thread not found or empty");
      }

      // Get the last message in the thread
      const lastMessage = thread.data.messages[thread.data.messages.length - 1];
      const headers = lastMessage.payload.headers;
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      // Format reply headers
      const subject = getHeader("subject");
      const originalSender = getHeader("from").split("<")[1]?.split(">")[0] || getHeader("from");
      const inReplyTo = getHeader("message-id");
      const references = `${getHeader("references")} ${inReplyTo}`.trim();
      
      // Generate a boundary for multipart messages
      const boundary = `boundary_${Date.now().toString(16)}`;
      
      // Determine content type based on whether we have HTML and/or attachments
      let contentType = isHtml ? "multipart/alternative" : "text/plain";
      if (attachments.length > 0) {
        contentType = "multipart/mixed";
      }
      
      // Start building email content
      let emailParts = [
        `In-Reply-To: ${inReplyTo}`,
        `References: ${references}`,
        `To: ${originalSender}`,
        `Subject: Re: ${subject}`,
        `MIME-Version: 1.0`
      ];
      
      // Add appropriate content type header
      if (contentType.startsWith("multipart/")) {
        emailParts.push(`Content-Type: ${contentType}; boundary="${boundary}"`);
        emailParts.push("");
        
        // Add text part
        emailParts.push(`--${boundary}`);
        emailParts.push("Content-Type: text/plain; charset=UTF-8");
        emailParts.push("");
        emailParts.push(body.replace(/<[^>]*>/g, '')); // Strip HTML tags for plain text version
        
        // Add HTML part if needed
        if (isHtml) {
          emailParts.push(`--${boundary}`);
          emailParts.push("Content-Type: text/html; charset=UTF-8");
          emailParts.push("");
          emailParts.push(body);
        }
        
        // Add attachments if any
        for (const attachment of attachments) {
          emailParts.push(`--${boundary}`);
          emailParts.push(`Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`);
          emailParts.push("Content-Transfer-Encoding: base64");
          emailParts.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
          emailParts.push("");
          emailParts.push(attachment.content); // Base64 encoded content
        }
        
        // Close the boundary
        emailParts.push(`--${boundary}--`);
      } else {
        // Simple plain text email
        emailParts.push("Content-Type: text/plain; charset=UTF-8");
        emailParts.push("");
        emailParts.push(body);
      }
      
      const replyContent = emailParts.join("\n");

      // Send the reply
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: Buffer.from(replyContent).toString("base64"),
          threadId: threadId
        }
      });

      if (!response.data || !response.data.id) {
        throw new Error("Failed to send reply: No message ID received");
      }

      // Get the updated thread details
      const messageDetails = await gmail.users.messages.get({
        userId: "me",
        id: response.data.id,
      });

      // Update the thread in our database
      const threadDoc = await Email.findOne({ threadId, provider: this.getProviderName() });
      if (!threadDoc) {
        throw new Error("Thread not found in database");
      }

      // Create new message object with attachment info if present
      const newMessage = {
        messageId: response.data.id,
        sender: userEmail,
        recipient: originalSender,
        subject: `Re: ${subject}`,
        body: isHtml ? body : (messageDetails.data.snippet || body),
        timestamp: new Date(parseInt(messageDetails.data.internalDate)).toISOString(),
        isInbound: false,
        isRead: true,
        isHtml: isHtml,
        attachments: attachments.map(att => ({
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.content.length * 0.75 // Approximate size from base64
        }))
      };

      // Update the thread document
      await Email.findOneAndUpdate(
        { threadId, provider: this.getProviderName() },
        {
          $push: { messages: newMessage },
          $set: { latestTimestamp: newMessage.timestamp },
          $addToSet: { participants: [userEmail, originalSender] }
        },
        { new: true }
      );

      return { 
        success: true, 
        messageId: response.data.id,
        threadId: threadId,
        message: newMessage
      };
    } catch (error) {
      console.error("Error sending reply:", error);
      throw new Error(`Failed to send reply: ${error.message}`);
    }
  }

  /**
   * Archive an email in Gmail
   * @param {string} userEmail - The user's email address
   * @param {string} threadId - The ID of the thread to archive
   * @returns {Promise<Object>} Archive results
   */
  async archiveEmail(userEmail, threadId) {
    try {
      if (!threadId || !userEmail) {
        throw new Error("Thread ID and email are required");
      }

      const gmail = await this._getAuthenticatedClient(userEmail);

      // Remove "INBOX" label in Gmail (Archiving)
      await gmail.users.messages.modify({
        userId: "me",
        id: threadId,
        requestBody: { removeLabelIds: ["INBOX"] },
      });

      // Update MongoDB
      await Email.findOneAndUpdate(
        { threadId, provider: this.getProviderName() }, 
        { isArchived: true }
      );

      return { success: true, message: "Email archived successfully" };
    } catch (error) {
      console.error("Error archiving email:", error);
      throw new Error(`Failed to archive email: ${error.message}`);
    }
  }
  
  /**
   * Archive a thread in Gmail
   * @param {string} userEmail - The user's email address
   * @param {string} threadId - The ID of the thread to archive
   * @returns {Promise<Object>} Archive results
   */
  async archiveThread(userEmail, threadId) {
    try {
      if (!threadId || !userEmail) {
        throw new Error("Thread ID and email are required");
      }

      const gmail = await this._getAuthenticatedClient(userEmail);

      // Get the thread to find all message IDs
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: threadId
      });
      
      if (!thread.data || !thread.data.messages || thread.data.messages.length === 0) {
        throw new Error("Thread not found or empty");
      }
      
      // Remove "INBOX" label from all messages in the thread
      for (const message of thread.data.messages) {
        await gmail.users.messages.modify({
          userId: "me",
          id: message.id,
          requestBody: { removeLabelIds: ["INBOX"] },
        });
      }

      return { success: true, message: "Thread archived successfully" };
    } catch (error) {
      console.error("Error archiving thread:", error);
      throw new Error(`Failed to archive thread: ${error.message}`);
    }
  }

  /**
   * Send a reply to an email thread
   * @param {string} userEmail - The user's email address
   * @param {string} threadId - The ID of the thread to reply to
   * @param {string} replyText - The reply message text
   * @param {Array} [attachments] - Optional array of attachment objects
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>} Reply results
   */
  /**
   * Determines the appropriate recipient for a reply
   * @param {Object} thread - The email thread object
   * @returns {string} The email address of the appropriate recipient
   * @private
   */
  _determineReplyRecipient(thread) {
    // If there are no messages, return null
    if (!thread.messages || thread.messages.length === 0) {
      return null;
    }
    
    // Get the user's email (the owner of this thread)
    const userEmail = thread.userEmail.toLowerCase();
    
    // Sort messages by timestamp in descending order (newest first)
    const sortedMessages = [...thread.messages].sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    // Find the most recent message not sent by the user
    for (const message of sortedMessages) {
      if (message.sender && message.sender.toLowerCase() !== userEmail) {
        return message.sender;
      }
    }
    
    // If all messages are from the user, use the recipient of the most recent message
    if (sortedMessages[0].recipient && sortedMessages[0].recipient.toLowerCase() !== userEmail) {
      return sortedMessages[0].recipient;
    }
    
    // Fallback to the original sender of the first message
    return thread.messages[0].sender;
  }

  async sendReply(userEmail, threadId, replyText, attachments = []) {
    try {
      // Find the email thread to get the original message details
      const thread = await Email.findOne({
        threadId,
        provider: this.getProviderName(),
        userEmail: userEmail.toLowerCase()
      });
      
      if (!thread) {
        return { success: false, error: "Thread not found" };
      }
      
      // Process attachments to ensure they're valid and properly formatted
      const processedAttachments = [];
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          // Validate attachment format
          if (attachment && attachment.filename && attachment.content) {
            // Clean up base64 content to ensure it's valid
            const cleanContent = attachment.content.replace(/\s/g, '');
            processedAttachments.push({
              ...attachment,
              content: cleanContent
            });
          }
        }
      }
      
      // Get the original message to reply to
      const gmail = await this._getAuthenticatedClient(userEmail);
      
      // Create a reply message
      const messageResponse = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          threadId: threadId,
          raw: this._createReplyEmail(thread, replyText, processedAttachments)
        }
      });
      
      if (messageResponse.data && messageResponse.data.id) {
        // Get the full message details
        const messageDetails = await gmail.users.messages.get({
          userId: "me",
          id: messageResponse.data.id
        });
        
        // Get subject from thread or ensure it has Re: prefix
        const messageSubject = thread.subject ? 
          (thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`) : 
          'Re: No Subject';
          
        // Create a new message object for our database
        const newMessage = {
          messageId: messageResponse.data.id,
          sender: userEmail.toLowerCase(),
          recipient: this._determineReplyRecipient(thread), // Reply to the appropriate recipient
          subject: messageSubject,
          body: replyText,
          timestamp: new Date().toISOString(),
          isInbound: false,
          isRead: true,
          isHtml: true, // Mark as HTML content since we're sending HTML
          attachments: processedAttachments.map(att => ({
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.content ? Math.round(att.content.length * 0.75) : 0 // Approximate size from base64
          }))
        };
        
        // Update the thread in the database
        await Email.findOneAndUpdate(
          { 
            threadId,
            provider: this.getProviderName(),
            userEmail: userEmail.toLowerCase()
          },
          {
            $push: { messages: newMessage },
            $set: { latestTimestamp: newMessage.timestamp }
          }
        );
        
        return { 
          success: true,
          messageId: messageResponse.data.id,
          message: "Reply sent successfully"
        };
      } else {
        return { success: false, error: "Failed to send reply" };
      }
    } catch (error) {
      console.error("Error sending reply:", error);
      return { 
        success: false,
        error: error.message || "Failed to send reply"
      };
    }
  }
  
  /**
   * Create a properly formatted email for replying
   * @private
   */
  _createReplyEmail(thread, replyText, attachments = []) {
    // Get the original message and recipients
    const originalMessage = thread.messages[0];
    const to = originalMessage.sender;
    
    // Create email headers
    // Prevent double 'Re:' prefix
    const subject = thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`;
    
    // Generate a random boundary string for multipart emails
    const boundary = `boundary_${Date.now().toString(16)}_${Math.random().toString(16).substr(2)}`;
    
    // Start with email headers
    let email = [];
    
    // If we have attachments, use multipart/mixed
    if (attachments && attachments.length > 0) {
      email = [
        `From: ${thread.userEmail}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `In-Reply-To: ${originalMessage.messageId}`,
        `References: ${originalMessage.messageId}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary=${boundary}`,
        ''
      ];
    } else {
      // Simple email without attachments
      email = [
        `From: ${thread.userEmail}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `In-Reply-To: ${originalMessage.messageId}`,
        `References: ${originalMessage.messageId}`,
        'Content-Type: text/html; charset=utf-8',
        ''
      ];
    }
    
    email = email.join('\r\n');
    
    // If we have attachments, format as multipart
    if (attachments && attachments.length > 0) {
      // Add the HTML part
      email += `\r\n--${boundary}\r\n`;
      email += 'Content-Type: text/html; charset=utf-8\r\n\r\n';
      email += replyText;
      email += '\r\n';
      
      // Add each attachment
      for (const attachment of attachments) {
        // Skip invalid attachments
        if (!attachment.content || !attachment.filename) continue;
        
        email += `\r\n--${boundary}\r\n`;
        email += `Content-Type: ${attachment.mimeType || 'application/octet-stream'}\r\n`;
        email += `Content-Transfer-Encoding: base64\r\n`;
        email += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n\r\n`;
        
        try {
          // Ensure content is valid base64 and add proper line breaks
          // Gmail API requires base64 content to have line breaks every 76 chars
          const cleanContent = attachment.content.replace(/\s/g, '');
          const content = cleanContent.match(/.{1,76}/g) || [];
          email += content.join('\r\n');
          email += '\r\n';
        } catch (err) {
          console.error(`Error processing attachment ${attachment.filename}:`, err);
          // Continue with other attachments if one fails
        }
      }
      
      // Close the multipart message
      email += `\r\n--${boundary}--\r\n`;
    } else {
      // Just add the HTML body for simple emails
      email += '\r\n' + replyText + '\r\n';
    }
    
    // Convert to base64url format as required by Gmail API
    return Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Get the provider name
   * @returns {string} The provider name
   */
  getProviderName() {
    return 'gmail';
  }

  /**
   * Mark a message or thread as read in Gmail
   * @param {string} userEmail - The user's email address
   * @param {string} threadId - The ID of the thread to mark as read
   * @param {string} [messageId] - Optional specific message ID to mark as read
   * @returns {Promise<Object>} Result of the operation
   */
  async markAsRead(userEmail, threadId, messageId = null) {
    try {
      if (!threadId || !userEmail) {
        throw new Error("Thread ID and email are required");
      }

      const gmail = await this._getAuthenticatedClient(userEmail);
      
      if (messageId) {
        // If specific messageId is provided, only mark that message as read
        console.log(`Marking specific message ${messageId} as read`);
        await gmail.users.messages.modify({
          userId: "me",
          id: messageId,
          requestBody: { removeLabelIds: ["UNREAD"] },
        });
      } else {
        // Mark the whole thread as read by getting all messages in the thread
        console.log(`Marking all messages in thread ${threadId} as read`);
        try {
          // First get the thread to get all message IDs
          const threadResponse = await gmail.users.threads.get({
            userId: "me",
            id: threadId
          });
          
          // If we have messages in the thread, mark each one as read
          if (threadResponse.data && threadResponse.data.messages) {
            const messages = threadResponse.data.messages;
            console.log(`Found ${messages.length} messages in thread ${threadId}`);
            
            // Mark each message as read
            for (const message of messages) {
              if (message.labelIds && message.labelIds.includes("UNREAD")) {
                await gmail.users.messages.modify({
                  userId: "me",
                  id: message.id,
                  requestBody: { removeLabelIds: ["UNREAD"] },
                });
                console.log(`Marked message ${message.id} as read`);
              }
            }
          }
        } catch (threadError) {
          console.error(`Error getting thread messages: ${threadError.message}`);
          // Fallback to trying to modify the thread directly
          await gmail.users.messages.modify({
            userId: "me",
            id: threadId,
            requestBody: { removeLabelIds: ["UNREAD"] },
          });
        }
      }

      return { success: true, message: "Message marked as read successfully" };
    } catch (error) {
      console.error("Error marking message as read:", error);
      throw new Error(`Failed to mark message as read: ${error.message}`);
    }
  }

  /**
   * Download an attachment from a Gmail message
   * @param {string} userEmail - The email of the user
   * @param {string} messageId - The ID of the message containing the attachment
   * @param {string} attachmentId - The ID of the attachment to download
   * @returns {Promise<Object>} - The attachment data
   */
  async downloadAttachment(userEmail, messageId, attachmentId) {
    try {
      // Get the OAuth2 client for this user
      const oauth2Client = await this.getOAuth2Client(userEmail);
      if (!oauth2Client) {
        throw new Error("Failed to get OAuth2 client");
      }

      // Initialize Gmail API
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Get the attachment
      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: attachmentId
      });

      if (!response || !response.data || !response.data.data) {
        throw new Error("Failed to download attachment");
      }

      return {
        content: response.data.data, // Base64 encoded content
        size: response.data.size
      };
    } catch (error) {
      console.error(`Error downloading attachment: ${error.message}`);
      throw error;
    }
  }
}

module.exports = GmailService;
