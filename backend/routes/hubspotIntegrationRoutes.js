const express = require('express');
const router = express.Router();
const hubspotService = require('../services/hubspotService');
const Email = require('../models/Email');
const { validateProvider } = require('../middleware/validateProvider');

/**
 * Search for HubSpot contacts
 * GET /api/hubspot/contacts/search?query=searchterm
 */
router.get('/hubspot/contacts/search', validateProvider('hubspot'), async (req, res) => {
  try {
    const { query } = req.query;
    const userEmail = req.session.userEmail;
    
    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    if (!query) {
      return res.status(400).json({ success: false, error: 'Search query is required' });
    }
    
    const contacts = await hubspotService.searchContacts(userEmail, query);
    
    res.json({
      success: true,
      contacts
    });
  } catch (error) {
    console.error('Error searching HubSpot contacts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get a HubSpot contact by email
 * GET /api/hubspot/contacts/email/:email
 */
router.get('/hubspot/contacts/email/:email', validateProvider('hubspot'), async (req, res) => {
  try {
    const { email } = req.params;
    const userEmail = req.session.userEmail;
    
    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    const contact = await hubspotService.findContactByEmail(userEmail, email);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }
    
    res.json({
      success: true,
      contact
    });
  } catch (error) {
    console.error('Error getting HubSpot contact by email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create a new HubSpot contact
 * POST /api/hubspot/contacts
 */
router.post('/hubspot/contacts', validateProvider('hubspot'), async (req, res) => {
  try {
    const { email, firstName, lastName, phone, company } = req.body;
    const userEmail = req.session.userEmail;
    
    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    
    const contact = await hubspotService.createContact(userEmail, {
      email,
      firstName,
      lastName,
      phone,
      company
    });
    
    res.json({
      success: true,
      contact
    });
  } catch (error) {
    console.error('Error creating HubSpot contact:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get emails associated with a HubSpot contact
 * GET /api/hubspot/contacts/:contactId/emails
 */
router.get('/hubspot/contacts/:contactId/emails', validateProvider('hubspot'), async (req, res) => {
  try {
    const { contactId } = req.params;
    const userEmail = req.session.userEmail;
    
    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    const emails = await hubspotService.getContactEmails(userEmail, contactId);
    
    res.json({
      success: true,
      emails
    });
  } catch (error) {
    console.error('Error getting HubSpot contact emails:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Log an email to HubSpot and associate it with a contact
 * POST /api/hubspot/emails
 */
router.post('/hubspot/emails', validateProvider('hubspot'), async (req, res) => {
  try {
    const { emailData, contactId } = req.body;
    const userEmail = req.session.userEmail;
    
    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    if (!emailData) {
      return res.status(400).json({ success: false, error: 'Email data is required' });
    }
    
    const result = await hubspotService.logEmail(userEmail, emailData, contactId);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error logging email to HubSpot:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Sync emails from your app to HubSpot
 * POST /api/hubspot/sync/emails
 */
router.post('/hubspot/sync/emails', validateProvider('hubspot'), async (req, res) => {
  try {
    const { emailIds } = req.body;
    const userEmail = req.session.userEmail;
    
    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Email IDs array is required' });
    }
    
    // Fetch the emails from the database
    const emails = await Email.find({
      _id: { $in: emailIds },
      userEmail
    });
    
    if (emails.length === 0) {
      return res.status(404).json({ success: false, error: 'No emails found with the provided IDs' });
    }
    
    // Sync the emails to HubSpot
    const result = await hubspotService.syncEmailsToHubSpot(userEmail, emails);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error syncing emails to HubSpot:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Sync a single email from your app to HubSpot
 * POST /api/hubspot/sync/email/:emailId
 */
router.post('/hubspot/sync/email/:emailId', validateProvider('hubspot'), async (req, res) => {
  try {
    const { emailId } = req.params;
    const userEmail = req.session.userEmail;
    
    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    // Fetch the email from the database
    const email = await Email.findOne({
      _id: emailId,
      userEmail
    });
    
    if (!email) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }
    
    // Sync the email to HubSpot
    const result = await hubspotService.syncEmailsToHubSpot(userEmail, [email]);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error syncing email to HubSpot:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
