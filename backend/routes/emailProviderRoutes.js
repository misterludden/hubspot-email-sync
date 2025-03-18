const express = require("express");
const serviceFactory = require("../services/serviceFactory");
const router = express.Router();

// Get available providers
router.get("/providers", (req, res) => {
  try {
    const providers = serviceFactory.getAvailableEmailProviders();
    res.json({ success: true, providers });
  } catch (error) {
    res.status(500).json({ error: "Failed to get providers", details: error.message });
  }
});

// Get all available integration providers
router.get("/integration-providers", (req, res) => {
  try {
    const providers = serviceFactory.getAvailableIntegrationProviders();
    res.json({ success: true, providers });
  } catch (error) {
    res.status(500).json({ error: "Failed to get integration providers", details: error.message });
  }
});

// Add a new route to check authentication status for all providers
router.get('/auth-status', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    
    // Get all available email providers (not integration providers like HubSpot)
    const emailProviders = serviceFactory.getAvailableEmailProviders();
    
    // Check auth status for each email provider
    const authStatus = {};
    
    for (const provider of emailProviders) {
      try {
        const ServiceClass = serviceFactory.getEmailService(provider);
        if (ServiceClass) {
          const service = new ServiceClass();
          const isAuthenticated = await service.checkAuthStatus(email);
          authStatus[provider] = isAuthenticated;
        } else {
          authStatus[provider] = false;
        }
      } catch (error) {
        console.error(`Error checking auth status for ${provider}:`, error);
        authStatus[provider] = false;
      }
    }
    
    // Also check HubSpot integration if available
    try {
      // Use getIntegrationService for HubSpot as it's a CRM, not an email provider
      const HubspotServiceClass = serviceFactory.getIntegrationService('hubspot');
      if (HubspotServiceClass) {
        const hubspotService = new HubspotServiceClass();
        const isAuthenticated = await hubspotService.checkAuthStatus(email);
        authStatus.hubspot = isAuthenticated;
      } else {
        authStatus.hubspot = false;
      }
    } catch (error) {
      console.error('Error checking HubSpot auth status:', error);
      authStatus.hubspot = false;
    }
    
    res.json({ success: true, authStatus });
  } catch (error) {
    console.error('Error checking auth status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync emails
router.post("/:provider/sync", async (req, res) => {
  try {
    const { provider } = req.params;
    const { email, days } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    const emailService = serviceFactory.getEmailService(provider);
    const result = await emailService.syncEmails(email, { days });
    
    res.json(result);
  } catch (error) {
    console.error(`Error syncing ${req.params.provider} emails:`, error);
    res.status(500).json({ error: `Failed to sync emails`, details: error.message });
  }
});

// Check sync status
router.get("/:provider/sync-status", async (req, res) => {
  try {
    const { provider } = req.params;
    const emailService = serviceFactory.getEmailService(provider);
    const result = await emailService.getSyncStatus();
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to get sync status", details: error.message });
  }
});

// Send email
router.post("/:provider/send", async (req, res) => {
  try {
    const { provider } = req.params;
    const { email } = req.query;
    const { emailId, recipient, subject, body } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    const emailService = serviceFactory.getEmailService(provider);
    const result = await emailService.sendEmail(email, { emailId, recipient, subject, body });
    
    res.json(result);
  } catch (error) {
    console.error(`Error sending ${req.params.provider} email:`, error);
    res.status(500).json({ error: "Failed to send email", details: error.message });
  }
});

// Archive email
router.post("/:provider/archive", async (req, res) => {
  try {
    const { provider } = req.params;
    const { threadId, email } = req.body;
    
    if (!threadId || !email) {
      return res.status(400).json({ error: "Thread ID and email are required" });
    }
    
    const emailService = serviceFactory.getEmailService(provider);
    const result = await emailService.archiveEmail(email, threadId);
    
    res.json(result);
  } catch (error) {
    console.error(`Error archiving ${req.params.provider} email:`, error);
    res.status(500).json({ error: "Failed to archive email", details: error.message });
  }
});

module.exports = router;
