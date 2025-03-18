const GmailService = require('./gmailService');
const OutlookService = require('./outlookService');
const HubspotService = require('./hubspotService');

/**
 * Factory class for creating service instances
 * Handles both email services and other integration services
 */
class ServiceFactory {
  constructor() {
    // Initialize service instances
    this.services = {};
    
    // Email services
    this.emailServices = {};
    this.emailServices.gmail = GmailService;
    this.emailServices.outlook = OutlookService;
    
    // Integration services
    this.integrationServices = {};
    this.integrationServices.hubspot = HubspotService;
    
    // Combine all services for easy lookup
    this.services = {
      ...this.emailServices,
      ...this.integrationServices
    };
    
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
    
    // HubSpot environment variables
    const hubspotVars = ['HUBSPOT_CLIENT_ID', 'HUBSPOT_CLIENT_SECRET', 'HUBSPOT_REDIRECT_URI'];
    hubspotVars.forEach(varName => {
      if (!process.env[varName]) {
        console.warn(`Warning: ${varName} is not set. HubSpot integration may not work properly.`);
      }
    });
  }

  /**
   * Get a service by provider name
   * @param {string} provider - The provider name ('gmail', 'outlook', 'hubspot', etc.)
   * @returns {Object} The service instance
   */
  getService(provider) {
    const service = this.services[provider.toLowerCase()];
    if (!service) {
      throw new Error(`Unsupported provider: ${provider}. Must be one of: ${Object.keys(this.services).join(', ')}`);
    }
    return service;
  }

  /**
   * Get an email service by provider name
   * @param {string} provider - The email provider name ('gmail' or 'outlook')
   * @returns {Object} The email service instance
   */
  getEmailService(provider) {
    const service = this.emailServices[provider.toLowerCase()];
    if (!service) {
      throw new Error(`Unsupported email provider: ${provider}. Must be one of: ${Object.keys(this.emailServices).join(', ')}`);
    }
    return service;
  }
  
  /**
   * Get an integration service by provider name
   * @param {string} provider - The integration provider name (e.g., 'hubspot')
   * @returns {Object} The integration service instance
   */
  getIntegrationService(provider) {
    const service = this.integrationServices[provider.toLowerCase()];
    if (!service) {
      throw new Error(`Unsupported integration provider: ${provider}. Must be one of: ${Object.keys(this.integrationServices).join(', ')}`);
    }
    return service;
  }

  /**
   * Get all available service providers
   * @returns {Array<string>} List of all provider names
   */
  getAvailableProviders() {
    return Object.keys(this.services);
  }
  
  /**
   * Get all available email service providers
   * @returns {Array<string>} List of email provider names
   */
  getAvailableEmailProviders() {
    return Object.keys(this.emailServices);
  }
  
  /**
   * Get all available integration service providers
   * @returns {Array<string>} List of integration provider names
   */
  getAvailableIntegrationProviders() {
    return Object.keys(this.integrationServices);
  }
}

module.exports = new ServiceFactory();
