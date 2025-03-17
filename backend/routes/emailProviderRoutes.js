const express = require("express");
const emailServiceFactory = require("../services/emailServiceFactory");
const router = express.Router();

// Get available providers
router.get("/providers", (req, res) => {
  try {
    const providers = emailServiceFactory.getAvailableProviders();
    res.json({ success: true, providers });
  } catch (error) {
    res.status(500).json({ error: "Failed to get providers", details: error.message });
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
    
    const emailService = emailServiceFactory.getService(provider);
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
    const emailService = emailServiceFactory.getService(provider);
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
    
    const emailService = emailServiceFactory.getService(provider);
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
    
    const emailService = emailServiceFactory.getService(provider);
    const result = await emailService.archiveEmail(email, threadId);
    
    res.json(result);
  } catch (error) {
    console.error(`Error archiving ${req.params.provider} email:`, error);
    res.status(500).json({ error: "Failed to archive email", details: error.message });
  }
});

module.exports = router;
