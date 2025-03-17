const express = require("express");
const emailServiceFactory = require("../services/emailServiceFactory");

const router = express.Router();

// Get available auth providers
router.get("/auth/providers", (req, res) => {
  try {
    const providers = emailServiceFactory.getAvailableProviders();
    res.json({ success: true, providers });
  } catch (error) {
    res.status(500).json({ error: "Failed to get providers", details: error.message });
  }
});

// Step 1: Generate OAuth URL for a specific provider
router.get("/auth/:provider", async (req, res) => {
  try {
    const { provider } = req.params;
    const emailService = emailServiceFactory.getService(provider);
    const result = await emailService.generateAuthUrl();
    res.json(result);
  } catch (error) {
    console.error(`Error generating ${req.params.provider} auth URL:`, error);
    res.status(500).json({ error: "Failed to generate authentication URL", details: error.message });
  }
});

// Step 2: Handle OAuth Callback for Gmail
router.get("/auth/gmail/callback", async (req, res) => {
  try {
    const { code } = req.query;
    const emailService = emailServiceFactory.getService('gmail');
    const result = await emailService.handleCallback(code);

    // Redirect and store user email in localStorage on frontend
    res.redirect(`http://localhost:3000/settings?email=${encodeURIComponent(result.userEmail)}&provider=gmail`);
  } catch (error) {
    console.error("OAuth authentication failed:", error);
    res.status(500).json({ error: "OAuth authentication failed", details: error.message });
  }
});


// Step 2: Handle OAuth Callback for Outlook
router.get("/auth/outlook/callback", async (req, res) => {
  try {
    const { code } = req.query;
    const emailService = emailServiceFactory.getService('outlook');
    const result = await emailService.handleCallback(code);

    // Redirect and store user email in localStorage on frontend
    res.redirect(`http://localhost:3000/settings?email=${encodeURIComponent(result.userEmail)}&provider=outlook`);
  } catch (error) {
    console.error("OAuth authentication failed:", error);
    res.status(500).json({ error: "OAuth authentication failed", details: error.message });
  }
});

// Step 3: Provide Authentication Status
router.get("/auth/:provider/status", async (req, res) => {
  try {
    const { provider } = req.params;
    const email = req.query.email;
    
    if (!email) {
      return res.json({ authenticated: false, message: "No email provided." });
    }
    
    const emailService = emailServiceFactory.getService(provider);
    const result = await emailService.checkAuthStatus(email);
    
    res.json(result);
  } catch (error) {
    console.error(`Error checking ${req.params.provider} auth status:`, error);
    res.json({ authenticated: false, error: error.message });
  }
});

// Step 4: Handle Disconnect
router.post("/auth/:provider/disconnect", async (req, res) => {
  try {
    const { provider } = req.params;
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    const emailService = emailServiceFactory.getService(provider);
    const result = await emailService.disconnect(email);
    
    res.json(result);
  } catch (error) {
    console.error(`Error disconnecting ${req.params.provider}:`, error);
    res.status(500).json({ error: "Error disconnecting user", details: error.message });
  }
});

module.exports = router;
