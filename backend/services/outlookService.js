const axios = require('axios');
const msal = require('@azure/msal-node');
const Token = require("../models/Token");
const Email = require("../models/Email");
const EmailService = require("./emailService");

class OutlookService extends EmailService {
  constructor() {
    super();
    this.syncCompleted = false;
    
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
      
      const days = options.days || 1;
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);
      const isoDate = sinceDate.toISOString();

      console.log(`Fetching messages for ${userEmail} from Outlook API...`);
      
      // Use Microsoft Graph API to get messages
      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/me/messages?$filter=receivedDateTime ge ${isoDate}&$top=100`,
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
        console.log(`Saving message: ${message.messageId} | Subject: ${message.subject}`);

        // Check if the message already exists in the thread
        const existingMessage = await Email.findOne({ "messages.messageId": message.messageId });
        if (existingMessage) {
          console.log(`Skipping duplicate message: ${message.messageId}`);
          continue;
        }

        // Upsert thread and add messages without duplication
        await Email.findOneAndUpdate(
          { threadId: message.threadId },
          {
            $setOnInsert: { 
              threadId: message.threadId, 
              subject: message.subject,
              provider: this.getProviderName(),
            },
            $addToSet: {
              participants: { $each: [message.sender, message.recipient] },
            },
            $push: { messages: message },
          },
          { upsert: true }
        );
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
   * Get the provider name
   * @returns {string} The provider name
   */
  getProviderName() {
    return 'outlook';
  }
}

module.exports = new OutlookService();
