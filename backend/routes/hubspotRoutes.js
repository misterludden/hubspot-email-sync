const express = require('express');
const router = express.Router();
const hubspotService = require('../services/hubspotService');

// Generate HubSpot auth URL
router.get('/hubspot/auth-url', async (req, res) => {
  try {
    const authUrl = hubspotService.generateAuthUrl();
    res.json({ success: true, authUrl });
  } catch (error) {
    console.error('Error generating HubSpot auth URL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Handle HubSpot OAuth callback
router.get('/hubspot/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    console.log('Received HubSpot callback with code:', code ? 'Code received' : 'No code');
    console.log('Session data:', req.session);
    
    // Get the user email from the session
    const userEmail = req.session.userEmail;
    console.log('User email from session:', userEmail || 'Not found');
    
    if (!code) {
      console.error('No authorization code received from HubSpot');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?provider=hubspot&auth=error&message=${encodeURIComponent('No authorization code received')}`);
    }
    
    if (!userEmail) {
      console.error('No user email found in session');
      // Try to handle the case where session is lost
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?provider=hubspot&auth=error&message=${encodeURIComponent('Session expired or user email not found - please try again')}`);
    }
    
    // Exchange the code for tokens
    console.log('Exchanging code for tokens...');
    const result = await hubspotService.handleOAuthCallback(code, userEmail);
    console.log('Successfully authenticated with HubSpot for user:', userEmail);
    
    // Store success in session to ensure it persists
    req.session.hubspotAuthenticated = true;
    
    // Save session before redirecting to ensure it's persisted
    req.session.save((err) => {
      if (err) {
        console.error('Error saving session:', err);
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?provider=hubspot&auth=error&message=${encodeURIComponent('Failed to save session')}`);
      }
      
      // Redirect to the settings page with success
      console.log('Redirecting to settings with success');
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?provider=hubspot&auth=success`);
    });
  } catch (error) {
    console.error('Error handling HubSpot OAuth callback:', error);
    console.error('Stack trace:', error.stack);
    // Redirect to the frontend with error
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?provider=hubspot&auth=error&message=${encodeURIComponent(error.message || 'Unknown error occurred')}`);
  }
});

// Check if user is authenticated with HubSpot
router.get('/hubspot/auth-status', async (req, res) => {
  try {
    const { userEmail } = req.query;
    
    if (!userEmail) {
      return res.status(400).json({ success: false, error: 'User email is required' });
    }
    
    const isAuthenticated = await hubspotService.checkAuthStatus(userEmail);
    
    res.json({
      success: true,
      isAuthenticated
    });
  } catch (error) {
    console.error('Error checking HubSpot auth status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync emails to HubSpot
router.post('/hubspot/sync-emails', async (req, res) => {
  try {
    const { userEmail, emails } = req.body;
    
    if (!userEmail) {
      return res.status(400).json({ success: false, error: 'User email is required' });
    }
    
    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({ success: false, error: 'Emails array is required' });
    }
    
    const result = await hubspotService.syncEmails(userEmail, emails);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error syncing emails to HubSpot:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
