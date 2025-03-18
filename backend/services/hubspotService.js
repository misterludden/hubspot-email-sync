const axios = require('axios');
const querystring = require('querystring');
const Token = require('../models/Token');

class HubspotService {
  constructor() {
    this.clientId = process.env.HUBSPOT_CLIENT_ID;
    this.clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    this.redirectUri = process.env.HUBSPOT_REDIRECT_URI;
    this.scopes = ['oauth', 'content', 'crm.objects.contacts.read', 'crm.objects.contacts.write', 'crm.objects.custom.read', 'crm.objects.custom.write'];
    this.baseUrl = 'https://api.hubapi.com';
    
    console.log('HubSpot Service initialized with:');
    console.log('Client ID:', this.clientId);
    console.log('Redirect URI:', this.redirectUri);
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
      
      // Use findOneAndDelete first to ensure we don't have any duplicate issues
      await Token.findOneAndDelete({ userEmail, provider: this.getProviderName() });
      
      // Now create a new token document
      try {
        console.log(`Creating new HubSpot token for user: ${userEmail}`);
        tokenDoc = await Token.create({
          userEmail,
          provider: this.getProviderName(),
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
        });
        console.log('Successfully created new token document');
      } catch (createError) {
        console.error('Error creating token document:', createError);
        throw new Error(`Failed to create token: ${createError.message}`);
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
      
      const tokenData = tokenResponse.data;
      
      // Update the token in the database
      const updatedTokenDoc = await Token.findByIdAndUpdate(
        tokenDoc._id,
        {
          tokens: {
            ...tokenDoc.tokens,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || tokenDoc.tokens.refresh_token,
            expiry_date: new Date(Date.now() + (tokenData.expires_in * 1000)),
            token_type: tokenData.token_type || tokenDoc.tokens.token_type
          },
          isValid: true,
          updatedAt: new Date()
        },
        { new: true }
      );
      
      return updatedTokenDoc;
    } catch (error) {
      console.error('Error refreshing HubSpot token:', error);
      throw error;
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
      
      return {
        accessToken: tokenDoc.tokens.access_token,
        hubId: tokenDoc.tokens.hub_id,
        userId: tokenDoc.tokens.user_id
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
      const client = await this.getAuthenticatedClient(userEmail);
      
      // Create a batch of email activities
      const results = await Promise.all(emails.map(async (email) => {
        try {
          // First, try to find the contact in HubSpot
          const contactEmail = email.isInbound ? email.sender.match(/<(.+)>/) ? email.sender.match(/<(.+)>/)[1] : email.sender : email.recipient;
          
          // Search for the contact
          const contactSearchResponse = await axios.get(`${this.baseUrl}/crm/v3/objects/contacts/search`, {
            headers: {
              Authorization: `Bearer ${client.accessToken}`,
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
              Authorization: `Bearer ${client.accessToken}`,
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
}

module.exports = new HubspotService();
