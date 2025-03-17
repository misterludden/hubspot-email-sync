/**
 * Base Email Service Interface
 * This abstract class defines the interface that all email provider implementations must follow.
 */
class EmailService {
  /**
   * Generate an authentication URL for the email provider
   * @returns {Promise<string>} The authentication URL
   */
  async generateAuthUrl() {
    throw new Error('Method not implemented');
  }

  /**
   * Handle the OAuth callback and retrieve tokens
   * @param {string} code - The authorization code from the OAuth callback
   * @returns {Promise<Object>} The user information and tokens
   */
  async handleCallback(code) {
    throw new Error('Method not implemented');
  }

  /**
   * Check the authentication status for a user
   * @param {string} userEmail - The user's email address
   * @returns {Promise<Object>} The authentication status
   */
  async checkAuthStatus(userEmail) {
    throw new Error('Method not implemented');
  }

  /**
   * Disconnect a user from the email provider
   * @param {string} userEmail - The user's email address
   * @returns {Promise<boolean>} Success status
   */
  async disconnect(userEmail) {
    throw new Error('Method not implemented');
  }

  /**
   * Sync emails from the provider
   * @param {string} userEmail - The user's email address
   * @param {Object} options - Sync options (e.g., days, query)
   * @returns {Promise<Object>} Sync results
   */
  async syncEmails(userEmail, options) {
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
   * Get the provider name
   * @returns {string} The provider name
   */
  getProviderName() {
    throw new Error('Method not implemented');
  }
}

module.exports = EmailService;
