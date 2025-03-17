const gmailService = require('./gmailService');
const outlookService = require('./outlookService');

/**
 * Factory class for creating email service instances
 */
class EmailServiceFactory {
  constructor() {
    this.services = {
      gmail: gmailService,
      outlook: outlookService
    };
  }

  /**
   * Get an email service by provider name
   * @param {string} provider - The provider name ('gmail' or 'outlook')
   * @returns {EmailService} The email service instance
   */
  getService(provider) {
    const service = this.services[provider];
    if (!service) {
      throw new Error(`Unsupported email provider: ${provider}`);
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
