const axios = require('axios');
const querystring = require('querystring');
const Token = require('../models/Token');
const hubspot = require('@hubspot/api-client');

class HubspotService {
  constructor() {
    this.clientId = process.env.HUBSPOT_CLIENT_ID;
    this.clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    this.redirectUri = process.env.HUBSPOT_REDIRECT_URI;
    this.scopes = [
      'oauth', 
      'content', 
      'crm.objects.contacts.read', 
      'crm.objects.contacts.write', 
      'crm.objects.custom.read', 
      'crm.objects.custom.write',
      'timeline',
      'crm.objects.owners.read',
      'sales-email-read',
      'crm.objects.companies.read',
      'crm.objects.companies.write',
      'crm.objects.deals.read',
      'crm.objects.deals.write',
    ];
    this.baseUrl = 'https://api.hubapi.com';
    
    console.log('HubSpot Service initialized with:');
    console.log('Client ID:', this.clientId);
    console.log('Redirect URI:', this.redirectUri);
    
    // Initialize HubSpot client (will be set with token when needed)
    this.hubspotClient = new hubspot.Client();
  }

  getProviderName() {
    return 'hubspot';
  }

  /**
   * Generate the OAuth URL for HubSpot authorization
   * @returns {string} The authorization URL
   */
  generateAuthUrl() {
    const authUrl = 'https://app.hubspot.com/oauth/authorize';
    
    // Generate a random state parameter to prevent CSRF attacks
    const state = Math.random().toString(36).substring(2, 15);
    
    const queryParams = {
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(' '),
      response_type: 'code',
      state: state,
      prompt: 'consent' // Force HubSpot to show the consent screen even if previously authorized
    };

    const fullAuthUrl = `${authUrl}?${querystring.stringify(queryParams)}`;
    console.log('Generated HubSpot auth URL:', fullAuthUrl);
    return fullAuthUrl;
  }

  /**
   * Handle the OAuth callback from HubSpot
   * @param {string} code - The authorization code from HubSpot
   * @param {string} userEmail - The user's email address
   * @returns {Promise<Object>} The token response
   */
  async handleOAuthCallback(code, userEmail) {
    try {
      console.log(`Handling HubSpot OAuth callback for user: ${userEmail}`);
      
      // Exchange the code for tokens
      const tokenResponse = await axios.post('https://api.hubapi.com/oauth/v1/token', querystring.stringify({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        code: code
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const tokenData = tokenResponse.data;
      console.log('Successfully exchanged code for tokens');
      
      // Get the HubSpot user info to associate with the token
      const userInfoResponse = await axios.get(`${this.baseUrl}/oauth/v1/access-tokens/${tokenData.access_token}`);
      const hubspotUserId = userInfoResponse.data.user_id;
      const hubspotHubId = userInfoResponse.data.hub_id;
      console.log(`HubSpot user ID: ${hubspotUserId}, Hub ID: ${hubspotHubId}`);
      
      let tokenDoc;
      
      // Use findOneAndUpdate to update the existing token or create a new one
      try {
        console.log(`Creating or updating HubSpot token for user: ${userEmail}`);
        tokenDoc = await Token.findOneAndUpdate(
          { userEmail, provider: this.getProviderName() },
          {
            tokens: {
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
              expiry_date: new Date(Date.now() + (tokenData.expires_in * 1000)),
              token_type: tokenData.token_type,
              hub_id: hubspotHubId,
              user_id: hubspotUserId
            },
            isValid: true,
            lastSyncTime: new Date()
          },
          { new: true, upsert: true }
        );
        console.log('Successfully created or updated token document:', tokenDoc);
      } catch (createError) {
        console.error('Error creating or updating token document:', createError);
        throw new Error(`Failed to create or update token: ${createError.message}`);
      }

      return {
        success: true,
        tokenDoc
      };
    } catch (error) {
      console.error('Error handling HubSpot OAuth callback:', error);
      throw new Error(`HubSpot OAuth error: ${error.message}`);
    }
  }

  /**
   * Refresh an expired HubSpot token
   * @param {Object} tokenDoc - The token document from the database
   * @returns {Promise<Object>} The updated token document
   */
  async refreshToken(tokenDoc) {
    try {
      // Exchange the refresh token for a new access token
      const tokenResponse = await axios.post('https://api.hubapi.com/oauth/v1/token', querystring.stringify({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: tokenDoc.tokens.refresh_token
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      const newTokenData = tokenResponse.data;
      console.log('Successfully refreshed HubSpot token');
      
      // Update the token document with the new tokens
      tokenDoc.tokens.access_token = newTokenData.access_token;
      tokenDoc.tokens.refresh_token = newTokenData.refresh_token;
      tokenDoc.tokens.expiry_date = new Date(Date.now() + (newTokenData.expires_in * 1000));
      tokenDoc.isValid = true;
      await tokenDoc.save();
      
      return tokenDoc.tokens;
    } catch (error) {
      console.error('Error refreshing HubSpot token:', error);
      throw new Error(`Failed to refresh token: ${error.message}`);
    }
  }

  /**
   * Check if a user has a valid HubSpot token
   * @param {string} userEmail - The user's email address
   * @returns {Promise<boolean>} Whether the user has a valid token
   */
  async checkAuthStatus(userEmail) {
    try {
      // Find the token in the database
      const tokenDoc = await Token.findOne({ 
        userEmail, 
        provider: this.getProviderName(),
        isValid: true
      });
      
      if (!tokenDoc) {
        console.log(`No valid HubSpot token found for user: ${userEmail}`);
        return false;
      }
      
      // Check if the token is expired
      const expiryDate = new Date(tokenDoc.tokens.expiry_date);
      if (expiryDate <= new Date()) {
        console.log(`HubSpot token expired for user: ${userEmail}`);
        
        // Try to refresh the token
        try {
          // Pass the token document instead of just the email
          await this.refreshToken(tokenDoc);
          return true;
        } catch (refreshError) {
          console.error('Error refreshing HubSpot token:', refreshError);
          
          // Mark the token as invalid
          await Token.findByIdAndUpdate(tokenDoc._id, { isValid: false });
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error checking HubSpot auth status:', error);
      return false;
    }
  }

  /**
   * Get an authenticated HubSpot API client
   * @param {string} userEmail - The user's email address
   * @returns {Promise<Object>} The authenticated client
   */
  async getAuthenticatedClient(userEmail) {
    try {
      const isAuthenticated = await this.checkAuthStatus(userEmail);
      
      if (!isAuthenticated) {
        throw new Error('User is not authenticated with HubSpot');
      }
      
      const tokenDoc = await Token.findOne({ userEmail, provider: this.getProviderName() });
      
      // Set the access token on the HubSpot client
      this.hubspotClient.setAccessToken(tokenDoc.tokens.access_token);
      
      return {
        accessToken: tokenDoc.tokens.access_token,
        hubId: tokenDoc.tokens.hub_id,
        userId: tokenDoc.tokens.user_id,
        client: this.hubspotClient
      };
    } catch (error) {
      console.error('Error getting authenticated HubSpot client:', error);
      throw new Error(`HubSpot authentication error: ${error.message}`);
    }
  }

  /**
   * Sync emails to HubSpot as activities
   * @param {string} userEmail - The user's email address
   * @param {Array} emails - The emails to sync
   * @returns {Promise<Object>} The sync results
   */
  async syncEmails(userEmail, emails) {
    try {
      const tokens = await this.getToken(userEmail);
      const accessToken = tokens.access_token;
      
      // Set the access token on the HubSpot client
      this.hubspotClient.setAccessToken(accessToken);
      
      const client = this.hubspotClient;
      
      // Create a batch of email activities
      const results = await Promise.all(emails.map(async (email) => {
        try {
          // First, try to find the contact in HubSpot
          const contactEmail = email.isInbound ? email.sender.match(/<(.+)>/) ? email.sender.match(/<(.+)>/)[1] : email.sender : email.recipient;
          
          // Search for the contact
          const contactSearchResponse = await axios.get(`${this.baseUrl}/crm/v3/objects/contacts/search`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            params: {
              q: contactEmail
            }
          });
          
          let contactId = null;
          if (contactSearchResponse.data.results && contactSearchResponse.data.results.length > 0) {
            contactId = contactSearchResponse.data.results[0].id;
          }
          
          // Create the email activity
          const emailActivity = {
            properties: {
              hs_timestamp: new Date(email.timestamp).getTime(),
              hs_email_direction: email.isInbound ? 'INBOUND' : 'OUTBOUND',
              hs_email_subject: email.subject,
              hs_email_text: email.body,
              hs_email_to: email.recipient,
              hs_email_from: email.sender
            }
          };
          
          // If we found a contact, associate the email with them
          if (contactId) {
            emailActivity.associations = [
              {
                to: {
                  id: contactId
                },
                types: [
                  {
                    category: 'HUBSPOT_DEFINED',
                    typeId: email.isInbound ? 'email_to_contact' : 'email_from_contact'
                  }
                ]
              }
            ];
          }
          
          // Create the email engagement
          const engagementResponse = await axios.post(`${this.baseUrl}/crm/v3/objects/emails`, emailActivity, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          });
          
          return {
            success: true,
            emailId: email.messageId,
            hubspotId: engagementResponse.data.id
          };
        } catch (emailError) {
          console.error(`Error syncing email ${email.messageId} to HubSpot:`, emailError);
          return {
            success: false,
            emailId: email.messageId,
            error: emailError.message
          };
        }
      }));
      
      return {
        success: true,
        results
      };
    } catch (error) {
      console.error('Error syncing emails to HubSpot:', error);
      throw new Error(`HubSpot sync error: ${error.message}`);
    }
  }

  /**
   * Get a contact by email
   * @param {string} userEmail - The user's email address
   * @param {string} contactEmail - The email of the contact to find
   * @returns {Promise<Object>} The contact object or null if not found
   */
  async getContactByEmail(userEmail, contactEmail) {
    try {
      if (!await this.isAuthenticated(userEmail)) {
        throw new Error('Not authenticated with HubSpot');
      }
      
      const filter = { propertyName: 'email', operator: 'EQ', value: contactEmail };
      const filterGroup = { filters: [filter] };
      const searchRequest = { 
        filterGroups: [filterGroup],
        sorts: [],
        properties: ['email', 'firstname', 'lastname', 'phone', 'company'],
        limit: 1
      };
      
      const result = await this.hubspotClient.crm.contacts.searchApi.doSearch(searchRequest);
      
      if (result.results && result.results.length > 0) {
        return result.results[0];
      }
      
      return null;
    } catch (error) {
      console.error('Error getting contact by email:', error);
      throw error;
    }
  }
  
  /**
   * Create a new contact in HubSpot
   * @param {string} userEmail - The email of the authenticated user
   * @param {Object} contactData - The contact data to create
   * @returns {Promise<Object>} The created contact
   */
  async createContact(userEmail, contactData) {
    try {
      if (!await this.isAuthenticated(userEmail)) {
        throw new Error('Not authenticated with HubSpot');
      }
      
      const properties = {
        email: contactData.email,
        firstname: contactData.firstName || '',
        lastname: contactData.lastName || '',
        phone: contactData.phone || '',
        company: contactData.company || ''
      };
      
      const result = await this.hubspotClient.crm.contacts.basicApi.create({ properties });
      return result;
    } catch (error) {
      console.error('Error creating contact:', error);
      throw error;
    }
  }
  
  /**
   * Log an email to HubSpot and associate it with a contact
   * @param {string} userEmail - The email of the authenticated user
   * @param {Object} emailData - The email data to log
   * @param {string} contactId - The HubSpot contact ID to associate with
   * @returns {Promise<Object>} The created email engagement
   */
  async logEmailToContact(userEmail, emailData, contactId) {
    try {
      if (!await this.isAuthenticated(userEmail)) {
        throw new Error('Not authenticated with HubSpot');
      }
      
      // Create the email properties
      const properties = {
        hs_timestamp: emailData.timestamp || Date.now(),
        hs_email_direction: emailData.direction || 'OUTGOING_EMAIL',
        hs_email_subject: emailData.subject || '',
        hs_email_text: emailData.text || '',
        hs_email_html: emailData.html || '',
        hs_email_headers: JSON.stringify(emailData.headers || {}),
        hs_email_from_email: emailData.from || userEmail,
        hs_email_to_email: emailData.to || ''
      };
      
      // Create the email object
      const emailObject = await this.hubspotClient.crm.objects.emails.basicApi.create({ properties });
      
      // Associate the email with the contact
      if (contactId && emailObject.id) {
        await this.hubspotClient.crm.objects.emails.associationsApi.create(
          emailObject.id,
          'contacts',
          contactId,
          'email_to_contact'
        );
      }
      
      return emailObject;
    } catch (error) {
      console.error('Error logging email to contact:', error);
      throw error;
    }
  }
  
  /**
   * Search for contacts in HubSpot
   * @param {string} userEmail - The email of the authenticated user
   * @param {string} query - The search query
   * @param {number} limit - The maximum number of results to return
   * @returns {Promise<Array>} The contacts found
   */
  async searchContacts(userEmail, query, limit = 10) {
    try {
      if (!await this.isAuthenticated(userEmail)) {
        throw new Error('Not authenticated with HubSpot');
      }
      
      // Create a filter for the search query across multiple properties
      const filters = [
        { propertyName: 'email', operator: 'CONTAINS_TOKEN', value: query },
        { propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: query },
        { propertyName: 'lastname', operator: 'CONTAINS_TOKEN', value: query },
        { propertyName: 'company', operator: 'CONTAINS_TOKEN', value: query }
      ];
      
      // Create filter groups (each group is OR'd together)
      const filterGroups = filters.map(filter => ({ filters: [filter] }));
      
      const searchRequest = { 
        filterGroups,
        sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
        properties: ['email', 'firstname', 'lastname', 'phone', 'company', 'lastmodifieddate'],
        limit
      };
      
      const result = await this.hubspotClient.crm.contacts.searchApi.doSearch(searchRequest);
      return result.results || [];
    } catch (error) {
      console.error('Error searching contacts:', error);
      throw error;
    }
  }
  
  /**
   * Get recent emails for a contact
   * @param {string} userEmail - The email of the authenticated user
   * @param {string} contactId - The HubSpot contact ID
   * @param {number} limit - The maximum number of emails to return
   * @returns {Promise<Array>} The emails associated with the contact
   */
  async getContactEmails(userEmail, contactId, limit = 10) {
    try {
      if (!await this.isAuthenticated(userEmail)) {
        throw new Error('Not authenticated with HubSpot');
      }
      
      // Get associations between contact and emails
      const associations = await this.hubspotClient.crm.contacts.associationsApi.getAll(
        contactId,
        'emails'
      );
      
      if (!associations.results || associations.results.length === 0) {
        return [];
      }
      
      // Get the email IDs from the associations
      const emailIds = associations.results
        .slice(0, limit)
        .map(association => association.id);
      
      // Batch get the emails
      const emailBatch = await this.hubspotClient.crm.objects.emails.batchApi.read({
        properties: [
          'hs_timestamp',
          'hs_email_direction',
          'hs_email_subject',
          'hs_email_text',
          'hs_email_html',
          'hs_email_from_email',
          'hs_email_to_email'
        ],
        inputs: emailIds.map(id => ({ id }))
      });
      
      return emailBatch.results || [];
    } catch (error) {
      console.error('Error getting contact emails:', error);
      throw error;
    }
  }
  /**
   * Find a contact in HubSpot by email address
   * @param {string} userEmail - The authenticated user's email
   * @param {string} contactEmail - The email of the contact to find
   * @returns {Promise<Object|null>} The contact object or null if not found
   */
  async findContactByEmail(userEmail, contactEmail) {
    try {
      const { client } = await this.getAuthenticatedClient(userEmail);
      
      const filter = { propertyName: 'email', operator: 'EQ', value: contactEmail };
      const filterGroup = { filters: [filter] };
      const searchRequest = { 
        filterGroups: [filterGroup],
        sorts: [],
        properties: ['email', 'firstname', 'lastname', 'phone', 'company'],
        limit: 1
      };
      
      const result = await client.crm.contacts.searchApi.doSearch(searchRequest);
      
      if (result.results && result.results.length > 0) {
        return result.results[0];
      }
      
      return null;
    } catch (error) {
      console.error('Error finding HubSpot contact by email:', error);
      throw new Error(`HubSpot contact search error: ${error.message}`);
    }
  }
  
  /**
   * Create a new contact in HubSpot
   * @param {string} userEmail - The authenticated user's email
   * @param {Object} contactData - The contact data to create
   * @returns {Promise<Object>} The created contact
   */
  async createContact(userEmail, contactData) {
    try {
      const { client } = await this.getAuthenticatedClient(userEmail);
      
      const properties = {
        email: contactData.email,
        firstname: contactData.firstName || '',
        lastname: contactData.lastName || '',
        phone: contactData.phone || '',
        company: contactData.company || ''
      };
      
      const result = await client.crm.contacts.basicApi.create({ properties });
      return result;
    } catch (error) {
      console.error('Error creating HubSpot contact:', error);
      throw new Error(`HubSpot contact creation error: ${error.message}`);
    }
  }
  
  /**
   * Log an email to HubSpot and associate it with a contact
   * @param {string} userEmail - The authenticated user's email
   * @param {Object} emailData - The email data to log
   * @param {string} contactId - Optional HubSpot contact ID to associate with
   * @returns {Promise<Object>} The created email engagement
   */
  async logEmail(userEmail, emailData, contactId = null) {
    try {
      const { client } = await this.getAuthenticatedClient(userEmail);
      
      // If contactId is not provided but we have a recipient email, try to find the contact
      if (!contactId && emailData.to) {
        const contact = await this.findContactByEmail(userEmail, emailData.to);
        if (contact) {
          contactId = contact.id;
        }
      }
      
      // Create the email properties
      const properties = {
        hs_timestamp: emailData.timestamp || Date.now(),
        hs_email_direction: emailData.direction || 'OUTGOING_EMAIL',
        hs_email_subject: emailData.subject || '',
        hs_email_text: emailData.text || '',
        hs_email_html: emailData.html || '',
        hs_email_headers: JSON.stringify(emailData.headers || {}),
        hs_email_from_email: emailData.from || userEmail,
        hs_email_to_email: emailData.to || ''
      };
      
      // Create the email object
      const emailObject = await client.crm.objects.emails.basicApi.create({ properties });
      
      // Associate the email with the contact if we have a contactId
      if (contactId && emailObject.id) {
        await client.crm.objects.emails.associationsApi.create(
          emailObject.id,
          'contacts',
          contactId,
          'email_to_contact'
        );
      }
      
      return emailObject;
    } catch (error) {
      console.error('Error logging email to HubSpot:', error);
      throw new Error(`HubSpot email logging error: ${error.message}`);
    }
  }
  
  /**
   * Search for contacts in HubSpot
   * @param {string} userEmail - The authenticated user's email
   * @param {string} query - The search query
   * @param {number} limit - The maximum number of results to return
   * @returns {Promise<Array>} The contacts found
   */
  async searchContacts(userEmail, query, limit = 10) {
    try {
      const { client } = await this.getAuthenticatedClient(userEmail);
      
      // Create a filter for the search query across multiple properties
      const filters = [
        { propertyName: 'email', operator: 'CONTAINS_TOKEN', value: query },
        { propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: query },
        { propertyName: 'lastname', operator: 'CONTAINS_TOKEN', value: query },
        { propertyName: 'company', operator: 'CONTAINS_TOKEN', value: query }
      ];
      
      // Create filter groups (each group is OR'd together)
      const filterGroups = filters.map(filter => ({ filters: [filter] }));
      
      const searchRequest = { 
        filterGroups,
        sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
        properties: ['email', 'firstname', 'lastname', 'phone', 'company', 'lastmodifieddate'],
        limit
      };
      
      const result = await client.crm.contacts.searchApi.doSearch(searchRequest);
      return result.results || [];
    } catch (error) {
      console.error('Error searching HubSpot contacts:', error);
      throw new Error(`HubSpot contact search error: ${error.message}`);
    }
  }
  
  /**
   * Get recent emails for a contact
   * @param {string} userEmail - The authenticated user's email
   * @param {string} contactId - The HubSpot contact ID
   * @param {number} limit - The maximum number of emails to return
   * @returns {Promise<Array>} The emails associated with the contact
   */
  async getContactEmails(userEmail, contactId, limit = 10) {
    try {
      const { client } = await this.getAuthenticatedClient(userEmail);
      
      // Get associations between contact and emails
      const associations = await client.crm.contacts.associationsApi.getAll(
        contactId,
        'emails'
      );
      
      if (!associations.results || associations.results.length === 0) {
        return [];
      }
      
      // Get the email IDs from the associations
      const emailIds = associations.results
        .slice(0, limit)
        .map(association => association.id);
      
      if (emailIds.length === 0) {
        return [];
      }
      
      // Batch get the emails
      const emailBatch = await client.crm.objects.emails.batchApi.read({
        properties: [
          'hs_timestamp',
          'hs_email_direction',
          'hs_email_subject',
          'hs_email_text',
          'hs_email_html',
          'hs_email_from_email',
          'hs_email_to_email'
        ],
        inputs: emailIds.map(id => ({ id }))
      });
      
      return emailBatch.results || [];
    } catch (error) {
      console.error('Error getting HubSpot contact emails:', error);
      throw new Error(`HubSpot contact emails error: ${error.message}`);
    }
  }
  
  /**
   * Sync emails from your app to HubSpot
   * @param {string} userEmail - The authenticated user's email
   * @param {Array} emails - Array of email objects to sync
   * @returns {Promise<Object>} Result of the sync operation
   */
  async syncEmailsToHubSpot(userEmail, emails) {
    try {
      const results = {
        success: 0,
        failed: 0,
        errors: []
      };
      
      for (const email of emails) {
        try {
          // Try to find the contact by email
          let contactId = null;
          if (email.to) {
            const contact = await this.findContactByEmail(userEmail, email.to);
            if (contact) {
              contactId = contact.id;
            } else {
              // Create a new contact if not found
              const newContact = await this.createContact(userEmail, {
                email: email.to,
                firstName: email.toName?.split(' ')[0] || '',
                lastName: email.toName?.split(' ').slice(1).join(' ') || ''
              });
              contactId = newContact.id;
            }
          }
          
          // Log the email to HubSpot
          await this.logEmail(userEmail, {
            from: email.from,
            to: email.to,
            subject: email.subject,
            text: email.text,
            html: email.html,
            timestamp: new Date(email.date).getTime(),
            direction: email.direction || 'OUTGOING_EMAIL',
            headers: email.headers || {}
          }, contactId);
          
          results.success++;
        } catch (error) {
          console.error(`Error syncing email to HubSpot: ${error.message}`);
          results.failed++;
          results.errors.push({
            email: email.id || email._id,
            error: error.message
          });
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error syncing emails to HubSpot:', error);
      throw new Error(`HubSpot email sync error: ${error.message}`);
    }
  }

  async getToken(userEmail) {
    const tokenDoc = await Token.findOne({ userEmail, provider: this.getProviderName() });
    if (!tokenDoc || !tokenDoc.isValid) {
      throw new Error('Token is invalid or not found.');
    }
    
    const now = new Date();
    const expiryDate = new Date(tokenDoc.tokens.expiry_date);
    
    // Check if the token is about to expire (e.g., within 5 minutes)
    if (expiryDate <= new Date(now.getTime() + 5 * 60 * 1000)) {
      throw new Error('Token is about to expire.');
    }
    
    return tokenDoc.tokens;
  }
}

module.exports = new HubspotService();
