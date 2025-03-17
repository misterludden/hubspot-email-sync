const Token = require('../models/Token');

/**
 * Base Email Service Interface
 * This abstract class defines the interface that all email provider implementations must follow.
 */
class EmailService {
  constructor() {
    if (new.target === EmailService) {
      throw new Error('EmailService is an abstract class and cannot be instantiated directly');
    }
    
    // Each provider must set this in their constructor
    this.providerName = null;
  }

  /**
   * Get the provider name
   * @returns {string} The provider name (e.g., 'gmail' or 'outlook')
   */
  getProviderName() {
    if (!this.providerName) {
      throw new Error('Provider name not set. Each provider must set this in their constructor.');
    }
    return this.providerName;
  }

  /**
   * Generate an authentication URL for the email provider
   * @returns {Promise<{url: string}>} The authentication URL
   */
  async generateAuthUrl() {
    throw new Error('Method not implemented');
  }

  /**
   * Handle the OAuth callback and retrieve tokens
   * @param {string} code - The authorization code from the OAuth callback
   * @returns {Promise<{userEmail: string}>} The user information
   */
  async handleCallback(code) {
    throw new Error('Method not implemented');
  }

  /**
   * Check the authentication status for a user
   * @param {string} userEmail - The user's email address
   * @returns {Promise<{authenticated: boolean, lastSync?: Date}>} The authentication status
   */
  async checkAuthStatus(userEmail) {
    const token = await Token.findOne({ 
      userEmail: userEmail.toLowerCase(), 
      provider: this.getProviderName() 
    });

    if (!token) {
      return { authenticated: false };
    }

    return { 
      authenticated: token.isValidAndActive(),
      lastSync: token.lastSyncTime
    };
  }

  /**
   * Disconnect a user from the email provider
   * @param {string} userEmail - The user's email address
   * @returns {Promise<{success: boolean}>} Success status
   */
  async disconnect(userEmail) {
    const result = await Token.findOneAndUpdate(
      { 
        userEmail: userEmail.toLowerCase(), 
        provider: this.getProviderName() 
      },
      { isValid: false },
      { new: true }
    );

    return { success: !!result };
  }

  /**
   * Sync emails from the provider
   * @param {string} userEmail - The user's email address
   * @param {Object} options - Sync options
   * @param {number} [options.days=7] - Number of days to sync
   * @param {string} [options.query] - Search query for filtering emails
   * @returns {Promise<{success: boolean, count: number}>} Sync results
   */
  async syncEmails(userEmail, options = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * Send an email
   * @param {string} userEmail - The sender's email address
   * @param {Object} emailData - The email data (recipient, subject, body)
   * @returns {Promise<Object>} Send results
   */
  async sendEmail(userEmail, emailData) {
    throw new Error('Method not implemented');
  }

  /**
   * Archive an email
   * @param {string} userEmail - The user's email address
   * @param {string} threadId - The ID of the thread to archive
   * @returns {Promise<Object>} Archive results
   */
  async archiveEmail(userEmail, threadId) {
    throw new Error('Method not implemented');
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
    throw new Error('Method not implemented');
  }

  /**
   * Get the provider name
   * @returns {string} The provider name
   */
  getProviderName() {
    throw new Error('Method not implemented');
  }
}

module.exports = EmailService;
