const { google } = require("googleapis");
const { authenticateGoogle, SCOPES } = require("../config.js");
const Token = require("../models/Token");
const Email = require("../models/Email");
const EmailService = require("./emailService");

class GmailService extends EmailService {
  constructor() {
    super();
    this.syncCompleted = false;
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
      await Token.findOneAndUpdate(
        { userEmail, provider: this.getProviderName() },
        { userEmail, provider: this.getProviderName(), tokens, updatedAt: new Date() },
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
   * Send an email via Gmail
   * @param {string} userEmail - The sender's email address
   * @param {Object} emailData - The email data (recipient, subject, body, emailId)
   * @returns {Promise<Object>} Send results
   */
  async sendEmail(userEmail, emailData) {
    try {
      const gmail = await this._getAuthenticatedClient(userEmail);
      
      const { emailId, recipient, subject, body } = emailData;
      const emailContent = `To: ${recipient}\nSubject: ${subject}\nContent-Type: text/plain; charset="UTF-8"\n\n${body}`;
      const encodedMessage = Buffer.from(emailContent).toString("base64");

      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodedMessage },
      });

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
   * Get the provider name
   * @returns {string} The provider name
   */
  getProviderName() {
    return 'gmail';
  }
}

module.exports = new GmailService();
