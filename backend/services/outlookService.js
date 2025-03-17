const axios = require('axios');
const msal = require('@azure/msal-node');
const Token = require("../models/Token");
const Email = require("../models/Email");
const EmailService = require("./emailService");

class OutlookService extends EmailService {
  constructor() {
    super();
    this.syncCompleted = false;
    this.providerName = 'outlook';
    
    // Validate required environment variables
    const requiredVars = ['OUTLOOK_CLIENT_ID', 'OUTLOOK_CLIENT_SECRET', 'OUTLOOK_TENANT_ID', 'OUTLOOK_REDIRECT_URI'];
    requiredVars.forEach(varName => {
      if (!process.env[varName]) {
        throw new Error(`${varName} environment variable is required for Outlook integration`);
      }
    });
    
    // Microsoft OAuth configuration
    this.msalConfig = {
      auth: {
        clientId: process.env.OUTLOOK_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.OUTLOOK_TENANT_ID}`,
        clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
      }
    };
    
    this.scopes = [
      'User.Read',
      'Mail.Read',
      'Mail.ReadWrite',
      'Mail.Send',
      'offline_access'
    ];
    
    this.redirectUri = process.env.OUTLOOK_REDIRECT_URI || 'http://localhost:5001/api/auth/outlook/callback';
    this.msalClient = new msal.ConfidentialClientApplication(this.msalConfig);
  }

  /**
   * Generate an authentication URL for Outlook
   * @returns {Promise<string>} The authentication URL
   */
  async generateAuthUrl() {
    try {
      const authCodeUrlParameters = {
        scopes: this.scopes,
        redirectUri: this.redirectUri,
      };

      const authUrl = await this.msalClient.getAuthCodeUrl(authCodeUrlParameters);
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
      const tokenRequest = {
        code: code,
        scopes: this.scopes,
        redirectUri: this.redirectUri,
      };

      const response = await this.msalClient.acquireTokenByCode(tokenRequest);
      const userEmail = response.account.username;
      
      // Store tokens with provider information
      await Token.findOneAndUpdate(
        { userEmail, provider: this.getProviderName() },
        { 
          userEmail, 
          provider: this.getProviderName(), 
          tokens: {
            access_token: response.accessToken,
            refresh_token: response.refreshToken,
            expiry_date: new Date(response.expiresOn).getTime()
          },
          updatedAt: new Date()
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
      
      // Check if token is expired and refresh if needed
      if (storedTokens.expiry_date && storedTokens.expiry_date < Date.now()) {
        try {
          const silentRequest = {
            scopes: this.scopes,
            account: { 
              homeAccountId: storedTokenDoc.tokens.homeAccountId,
              username: userEmail
            },
            forceRefresh: true
          };
          
          const response = await this.msalClient.acquireTokenSilent(silentRequest);
          
          // Update the stored tokens
          await Token.findOneAndUpdate(
            { userEmail, provider: this.getProviderName() }, 
            { 
              tokens: {
                access_token: response.accessToken,
                refresh_token: response.refreshToken,
                expiry_date: new Date(response.expiresOn).getTime(),
                homeAccountId: response.account.homeAccountId
              },
              updatedAt: new Date() 
            }
          );
        } catch (error) {
          console.error("Error refreshing token:", error);
          return { authenticated: false };
        }
      }

      // Verify token by making a simple API call
      try {
        await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: {
            Authorization: `Bearer ${storedTokens.access_token}`
          }
        });
        return { authenticated: true, email: userEmail };
      } catch (error) {
        console.error("Error verifying token:", error);
        return { authenticated: false };
      }
    } catch (error) {
      console.error("Error fetching authentication status:", error);
      return { authenticated: false };
    }
  }

  /**
   * Disconnect a user from Outlook
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
   * Get an authenticated access token
   * @param {string} userEmail - The user's email address
   * @returns {Promise<string>} The access token
   * @private
   */
  async _getAccessToken(userEmail) {
    const tokenDoc = await Token.findOne({ userEmail, provider: this.getProviderName() });
    if (!tokenDoc || !tokenDoc.tokens) {
      throw new Error("OAuth tokens missing. Please reconnect your account.");
    }

    const storedTokens = tokenDoc.tokens;
    
    // Check if token is expired and refresh if needed
    if (storedTokens.expiry_date && storedTokens.expiry_date < Date.now()) {
      try {
        const silentRequest = {
          scopes: this.scopes,
          account: { 
            homeAccountId: storedTokens.homeAccountId,
            username: userEmail
          },
          forceRefresh: true
        };
        
        const response = await this.msalClient.acquireTokenSilent(silentRequest);
        
        // Update the stored tokens
        const updatedTokens = {
          access_token: response.accessToken,
          refresh_token: response.refreshToken,
          expiry_date: new Date(response.expiresOn).getTime(),
          homeAccountId: response.account.homeAccountId
        };
        
        await Token.findOneAndUpdate(
          { userEmail, provider: this.getProviderName() }, 
          { tokens: updatedTokens, updatedAt: new Date() }
        );
        
        return updatedTokens.access_token;
      } catch (error) {
        console.error("Error refreshing token:", error);
        throw new Error("Failed to refresh token. Please reconnect your account.");
      }
    }
    
    return storedTokens.access_token;
  }

  /**
   * Sync emails from Outlook
   * @param {string} userEmail - The user's email address
   * @param {Object} options - Sync options (e.g., days)
   * @returns {Promise<Object>} Sync results
   */
  async syncEmails(userEmail, options = {}) {
    try {
      if (!userEmail) {
        throw new Error("User email is required for sync.");
      }

      const accessToken = await this._getAccessToken(userEmail);
      
      // Determine the time window for fetching messages
      let filterQuery;
      
      if (options.forceFull) {
        // For full sync, use the specified days parameter
        const days = options.days || 7;
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - days);
        const isoDate = sinceDate.toISOString();
        filterQuery = `receivedDateTime ge ${isoDate}`;
      } else if (options.polling) {
        // For explicit polling, get very recent messages (last 10 minutes)
        // This ensures we catch all new messages during polling
        const tenMinutesAgo = new Date();
        tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);
        const isoDate = tenMinutesAgo.toISOString();
        filterQuery = `receivedDateTime ge ${isoDate}`;
        console.log(`Polling for Outlook messages after: ${isoDate}`);
      } else {
        // For regular polling, get messages from the last hour to ensure we catch recent messages
        const oneHourAgo = new Date();
        oneHourAgo.setHours(oneHourAgo.getHours() - 1);
        const isoDate = oneHourAgo.toISOString();
        filterQuery = `receivedDateTime ge ${isoDate}`;
      }

      console.log(`Fetching messages for ${userEmail} from Outlook API with filter: ${filterQuery}...`);
      
      // Use Microsoft Graph API to get messages with appropriate filter
      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/me/messages?$filter=${filterQuery}&$top=100&$orderby=receivedDateTime desc`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const messages = response.data.value || [];
      console.log(`Processing ${messages.length} messages...`);

      if (messages.length === 0) {
        this.syncCompleted = true;
        return { success: true, message: "No messages found for sync." };
      }

      const messageDetails = await Promise.all(
        messages.map(async (msg) => {
          try {
            // Get full message details if needed
            const messageDetail = await axios.get(
              `https://graph.microsoft.com/v1.0/me/messages/${msg.id}?$select=id,conversationId,subject,bodyPreview,from,toRecipients,receivedDateTime`,
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            const detail = messageDetail.data;
            
            const messageObj = {
              messageId: detail.id,
              threadId: detail.conversationId,
              sender: detail.from.emailAddress.address,
              recipient: detail.toRecipients.map(r => r.emailAddress.address).join(', '),
              subject: detail.subject,
              body: detail.bodyPreview,
              timestamp: new Date(detail.receivedDateTime).toISOString(),
              isInbound: detail.from.emailAddress.address !== userEmail,
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
   * Send an email via Outlook
   * @param {string} userEmail - The sender's email address
   * @param {Object} emailData - The email data (recipient, subject, body, emailId)
   * @returns {Promise<Object>} Send results
   */
  async sendEmail(userEmail, emailData) {
    try {
      const accessToken = await this._getAccessToken(userEmail);
      
      const { emailId, recipient, subject, body } = emailData;
      
      // Create email using Microsoft Graph API
      const emailMessage = {
        message: {
          subject: subject,
          body: {
            contentType: 'Text',
            content: body
          },
          toRecipients: [
            {
              emailAddress: {
                address: recipient
              }
            }
          ]
        }
      };

      // Send email
      const response = await axios.post(
        'https://graph.microsoft.com/v1.0/me/sendMail',
        emailMessage,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Add the reply to the thread in the database
      await Email.updateOne(
        { messageId: emailId },
        { 
          $push: { 
            replies: { 
              sender: userEmail, 
              recipient, 
              subject, 
              body, 
              timestamp: new Date().toISOString(),
              provider: this.getProviderName(),
            } 
          } 
        }
      );

      return { success: true, message: "Email sent successfully", data: response.data };
    } catch (error) {
      console.error("Error sending email:", error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Archive an email in Outlook
   * @param {string} userEmail - The user's email address
   * @param {string} threadId - The ID of the thread to archive
   * @returns {Promise<Object>} Archive results
   */
  async archiveEmail(userEmail, threadId) {
    try {
      if (!threadId || !userEmail) {
        throw new Error("Thread ID and email are required");
      }

      const accessToken = await this._getAccessToken(userEmail);

      // Find all messages in this conversation
      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/me/messages?$filter=conversationId eq '${threadId}'`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const messages = response.data.value || [];
      
      // Move each message to archive folder
      for (const message of messages) {
        await axios.post(
          `https://graph.microsoft.com/v1.0/me/messages/${message.id}/move`,
          {
            destinationId: 'archive'
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
      }

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
      
      // Get access token
      const accessToken = await this._getAccessToken(userEmail);
      
      // Get the original message to reply to
      const originalMessage = thread.messages[0];
      
      // Prepare attachments if any
      const attachmentData = [];
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          attachmentData.push({
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": attachment.filename,
            "contentType": attachment.mimeType,
            "contentBytes": attachment.content
          });
        }
      }
      
      // Create reply payload
      // Prevent double 'Re:' prefix
      const subject = thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`;
      
      const replyPayload = {
        message: {
          subject: subject,
          body: {
            contentType: "html",
            content: replyText
          },
          toRecipients: [
            {
              emailAddress: {
                address: originalMessage.sender
              }
            }
          ],
          attachments: attachmentData
        },
        saveToSentItems: true
      };
      
      // Send the reply using Microsoft Graph API
      const response = await axios.post(
        `https://graph.microsoft.com/v1.0/me/messages/${originalMessage.messageId}/reply`,
        replyPayload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Get subject from thread or ensure it has Re: prefix
      const messageSubject = thread.subject ? 
        (thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`) : 
        'Re: No Subject';
        
      // Create a new message object for our database
      const newMessage = {
        messageId: `reply-${Date.now()}`, // Outlook doesn't return a message ID in the reply response
        sender: userEmail.toLowerCase(),
        recipient: originalMessage.sender,
        subject: messageSubject,
        body: replyText,
        timestamp: new Date().toISOString(),
        isInbound: false,
        isRead: true,
        isHtml: true, // Mark as HTML content since we're sending HTML
        attachments: attachments ? attachments.map(att => ({
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.content ? att.content.length * 0.75 : 0 // Approximate size from base64
        })) : []
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
        messageId: newMessage.messageId,
        message: "Reply sent successfully"
      };
    } catch (error) {
      console.error("Error sending reply:", error);
      return { 
        success: false,
        error: error.message || "Failed to send reply"
      };
    }
  }

  /**
   * Get the provider name
   * @returns {string} The provider name
   */
  getProviderName() {
    return 'outlook';
  }

  /**
   * Mark a message or thread as read in Outlook
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

      const accessToken = await this._getAccessToken(userEmail);
      
      if (messageId) {
        // If specific messageId is provided, only mark that message as read
        console.log(`Marking specific Outlook message ${messageId} as read`);
        await axios.patch(
          `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
          { isRead: true },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
      } else {
        // For Outlook, we need to find all messages in the conversation
        console.log(`Finding all messages in Outlook conversation ${threadId}`);
        
        try {
          // Get messages with the same conversationId (threadId)
          const response = await axios.get(
            `https://graph.microsoft.com/v1.0/me/messages?$filter=conversationId eq '${threadId}'`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          const messages = response.data.value || [];
          console.log(`Found ${messages.length} messages in Outlook conversation ${threadId}`);
          
          // Mark each message as read
          for (const message of messages) {
            if (!message.isRead) {
              await axios.patch(
                `https://graph.microsoft.com/v1.0/me/messages/${message.id}`,
                { isRead: true },
                {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              console.log(`Marked Outlook message ${message.id} as read`);
            }
          }
        } catch (error) {
          console.error(`Error finding messages in conversation: ${error.message}`);
          // Fallback: try to mark the threadId as a message ID (might work in some cases)
          try {
            await axios.patch(
              `https://graph.microsoft.com/v1.0/me/messages/${threadId}`,
              { isRead: true },
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                }
              }
            );
          } catch (fallbackError) {
            console.error(`Fallback also failed: ${fallbackError.message}`);
          }
        }
      }

      return { success: true, message: "Message marked as read successfully" };
    } catch (error) {
      console.error("Error marking message as read:", error);
      throw new Error(`Failed to mark message as read: ${error.message}`);
    }
  }

  /**
   * Download an attachment from an Outlook message
   * @param {string} userEmail - The email of the user
   * @param {string} messageId - The ID of the message containing the attachment
   * @param {string} attachmentId - The ID of the attachment to download
   * @returns {Promise<Object>} - The attachment data
   */
  async downloadAttachment(userEmail, messageId, attachmentId) {
    try {
      // Get access token
      const tokenDoc = await Token.findOne({ userEmail, provider: this.getProviderName() });
      if (!tokenDoc) {
        throw new Error("User not authenticated with Outlook");
      }

      // Ensure token is valid
      const accessToken = await this.getValidAccessToken(tokenDoc);
      if (!accessToken) {
        throw new Error("Failed to get valid access token");
      }

      // Get the attachment from Microsoft Graph API
      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments/${attachmentId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          responseType: 'json'
        }
      );

      if (!response || !response.data || !response.data.contentBytes) {
        throw new Error("Failed to download attachment");
      }

      return {
        content: response.data.contentBytes, // Base64 encoded content
        size: response.data.size
      };
    } catch (error) {
      console.error(`Error downloading attachment: ${error.message}`);
      throw error;
    }
  }
}

module.exports = OutlookService;
