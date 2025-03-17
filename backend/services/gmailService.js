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

      // Refresh token if expired
      if (storedTokens.expiry_date && storedTokens.expiry_date < Date.now()) {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);

        // Update the stored tokens
        await Token.findOneAndUpdate(
          { userEmail, provider: this.getProviderName() }, 
          { tokens: credentials, updatedAt: new Date() }
        );
      }

      // Fetch user email from Google API to confirm authentication
      const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
      const userInfo = await oauth2.userinfo.get();

      return { authenticated: true, email: userInfo.data.email };
    } catch (error) {
      console.error("Error fetching authentication status:", error);
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

    const storedTokens = tokenDoc.tokens;
    const oauth2Client = await authenticateGoogle();
    oauth2Client.setCredentials(storedTokens);

    if (storedTokens.expiry_date && storedTokens.expiry_date < Date.now()) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      await Token.findOneAndUpdate(
        { userEmail, provider: this.getProviderName() }, 
        { tokens: credentials, updatedAt: new Date() }
      );
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
      const query = `after:${Math.floor(sinceDate.getTime() / 1000)}`;

      console.log(`Fetching messages for ${userEmail} from Gmail API...`);
      const messagesResponse = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 100,
      });

      const messages = messagesResponse.data.messages || [];
      console.log(`Processing ${messages.length} messages...`);

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

            const msgDetail = await gmail.users.messages.get({ userId: "me", id: msg.id });
            const headers = msgDetail.data.payload.headers;

            const getHeader = (name) => headers.find((header) => header.name === name)?.value || "";

            const messageObj = {
              messageId: msgDetail.data.id,
              threadId: msgDetail.data.threadId,
              sender: getHeader("From"),
              recipient: getHeader("To"),
              subject: getHeader("Subject"),
              body: msgDetail.data.snippet,
              timestamp: new Date(parseInt(msgDetail.data.internalDate)).toISOString(),
              isInbound: getHeader("From") !== userEmail,
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
          // Use a single findOneAndUpdate operation with upsert to avoid race conditions
          // This will either update an existing thread or create a new one atomically
          const result = await Email.findOneAndUpdate(
            { 
              threadId: message.threadId,
              provider: this.getProviderName(),
              userEmail: userEmail.toLowerCase(),
              "messages.messageId": { $ne: message.messageId } // Only if this message doesn't exist
            },
            {
              $setOnInsert: {
                threadId: message.threadId,
                subject: message.subject,
                provider: this.getProviderName(),
                userEmail: userEmail.toLowerCase(),
              },
              $addToSet: {
                participants: { $each: [message.sender, message.recipient].filter(p => p) }
              },
              $push: { messages: message },
              $set: { 
                // Update timestamp if it's more recent
                latestTimestamp: message.timestamp
              }
            },
            { 
              upsert: true, 
              new: true,
              // Use this option to avoid the duplicate key error
              runValidators: false
            }
          );
          
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
   * Send a reply to an email thread
   * @param {string} userEmail - The user's email address
   * @param {string} threadId - The ID of the thread to reply to
   * @param {string} replyText - The reply message text
   * @param {Array} [attachments] - Optional array of attachment objects
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>} Reply results
   */
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
          recipient: thread.messages[0].sender, // Reply to the original sender
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
