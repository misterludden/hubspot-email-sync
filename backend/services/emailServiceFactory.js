const GmailService = require('./gmailService');
const OutlookService = require('./outlookService');

/**
 * Factory class for creating email service instances
 */
class EmailServiceFactory {
  constructor() {
    // Initialize service instances
    this.services = {};
    
    // Create singleton instances of each service
    this.services.gmail = new GmailService();
    this.services.outlook = new OutlookService();
    
    // Validate required environment variables
    this.validateEnvironment();
  }

  /**
   * Validate required environment variables for all providers
   * @private
   */
  validateEnvironment() {
    // Gmail environment variables
    const gmailVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];
    gmailVars.forEach(varName => {
      if (!process.env[varName]) {
        console.warn(`Warning: ${varName} is not set. Gmail integration may not work properly.`);
      }
    });

    // Outlook environment variables
    const outlookVars = ['OUTLOOK_CLIENT_ID', 'OUTLOOK_CLIENT_SECRET', 'OUTLOOK_TENANT_ID', 'OUTLOOK_REDIRECT_URI'];
    outlookVars.forEach(varName => {
      if (!process.env[varName]) {
        console.warn(`Warning: ${varName} is not set. Outlook integration may not work properly.`);
      }
    });
  }

  /**
   * Get an email service by provider name
   * @param {string} provider - The provider name ('gmail' or 'outlook')
   * @returns {EmailService} The email service instance
   */
  getService(provider) {
    const service = this.services[provider.toLowerCase()];
    if (!service) {
      throw new Error(`Unsupported email provider: ${provider}. Must be one of: gmail, outlook`);
    }
    return service;
  }

  /**
   * Get all available email service providers
   * @returns {Array<string>} List of provider names
   */
  getAvailableProviders() {
    return Object.keys(this.services);
  }
}

module.exports = new EmailServiceFactory();
