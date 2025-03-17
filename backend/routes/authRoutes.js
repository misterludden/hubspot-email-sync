const express = require("express");
const emailServiceFactory = require("../services/emailServiceFactory");
const Token = require("../models/Token");

const router = express.Router();

// Middleware to validate provider
const validateProvider = (req, res, next) => {
  const validProviders = ['gmail', 'outlook'];
  const provider = req.params.provider?.toLowerCase();
  
  if (!provider || !validProviders.includes(provider)) {
    return res.status(400).json({ 
      error: "Invalid provider", 
      message: `Provider must be one of: ${validProviders.join(', ')}`
    });
  }
  req.provider = provider;
  next();
};

// Get available auth providers with status
router.get("/auth/providers", async (req, res) => {
  try {
    const providers = emailServiceFactory.getAvailableProviders();
    const userEmail = req.query.email?.toLowerCase();
    
    if (!userEmail) {
      return res.json({ success: true, providers });
    }

    // Get auth status for each provider if email is provided
    const providerStatus = await Promise.all(providers.map(async (provider) => {
      const token = await Token.findOne({ userEmail, provider });
      return {
        provider,
        isAuthenticated: token?.isValidAndActive() || false,
        lastSync: token?.lastSyncTime
      };
    }));

    res.json({ success: true, providers: providerStatus });
  } catch (error) {
    res.status(500).json({ error: "Failed to get providers", details: error.message });
  }
});

// Step 1: Generate OAuth URL for a specific provider
router.get("/auth/:provider", validateProvider, async (req, res) => {
  try {
    const emailService = emailServiceFactory.getService(req.provider);
    const result = await emailService.generateAuthUrl();
    res.json(result);
  } catch (error) {
    console.error(`Error generating ${req.provider} auth URL:`, error);
    res.status(500).json({ error: "Failed to generate authentication URL", details: error.message });
  }
});

// Check authentication status
router.get("/auth/:provider/status", validateProvider, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const userEmail = email.toLowerCase();
    const token = await Token.findOne({ userEmail, provider: req.provider });
    
    if (!token) {
      return res.json({ authenticated: false });
    }

    // Check if token is valid and not expired
    const isAuthenticated = token.isValidAndActive();
    
    res.json({ 
      authenticated: isAuthenticated,
      lastSync: token.lastSyncTime,
      provider: req.provider
    });
  } catch (error) {
    console.error(`Error checking auth status for ${req.provider}:`, error);
    res.status(500).json({ error: "Failed to check authentication status", details: error.message });
  }
});

// Step 2: Handle OAuth Callback for providers
router.get("/auth/:provider/callback", validateProvider, async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      throw new Error('Authorization code is required');
    }

    const emailService = emailServiceFactory.getService(req.provider);
    const result = await emailService.handleCallback(code);

    // Redirect to frontend with provider info
    const redirectUrl = new URL('http://localhost:3000/settings');
    redirectUrl.searchParams.set('email', result.userEmail);
    redirectUrl.searchParams.set('provider', req.provider);
    redirectUrl.searchParams.set('success', 'true');
    
    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error(`OAuth authentication failed for ${req.provider}:`, error);
    
    // Redirect to frontend with error
    const redirectUrl = new URL('http://localhost:3000/settings');
    redirectUrl.searchParams.set('error', 'Authentication failed');
    redirectUrl.searchParams.set('provider', req.provider);
    
    res.redirect(redirectUrl.toString());
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
