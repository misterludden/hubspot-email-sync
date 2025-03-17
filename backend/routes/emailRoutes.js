const express = require("express");
const emailServiceFactory = require("../services/emailServiceFactory");
const Token = require("../models/Token");
const Email = require("../models/Email");

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

// Middleware to validate authentication
const validateAuth = async (req, res, next) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ error: "Email parameter is required" });
  }

  try {
    const token = await Token.findOne({ 
      userEmail: email.toLowerCase(), 
      provider: req.provider,
      isValid: true
    });

    if (!token || !token.isValidAndActive()) {
      return res.status(401).json({ 
        error: "Authentication required",
        message: "Please log in again to access your emails"
      });
    }

    req.userEmail = email.toLowerCase();
    req.token = token;
    next();
  } catch (error) {
    console.error(`Auth validation failed for ${req.provider}:`, error);
    res.status(500).json({ error: "Failed to validate authentication" });
  }
};

// Get emails for a specific provider
router.get("/:provider", validateProvider, validateAuth, async (req, res) => {
  try {
    const emails = await Email.find({ 
      provider: req.provider,
      userEmail: req.userEmail
    }).sort({ latestTimestamp: -1 });
    
    res.json(emails);
  } catch (error) {
    console.error(`Error fetching ${req.provider} emails:`, error);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});

// Get a single email thread
router.get("/:provider/thread/:threadId", validateProvider, validateAuth, async (req, res) => {
  try {
    const emailThread = await Email.findOne({ 
      threadId: req.params.threadId,
      provider: req.provider,
      userEmail: req.userEmail
    });

    if (!emailThread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    emailThread.messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(emailThread);
  } catch (error) {
    console.error(`Error fetching ${req.provider} thread:`, error);
    res.status(500).json({ error: "Failed to fetch email thread" });
  }
});

// Send a reply
router.post("/:provider/reply", validateProvider, validateAuth, async (req, res) => {
  try {
    const { threadId, replyText, attachments } = req.body;
    if (!threadId || !replyText) {
      return res.status(400).json({ error: "ThreadId and replyText are required" });
    }

    const emailService = emailServiceFactory.getService(req.provider);
    const result = await emailService.sendReply(req.userEmail, threadId, replyText, attachments);
    
    res.json(result);
  } catch (error) {
    console.error(`Error sending ${req.provider} reply:`, error);
    res.status(500).json({ error: "Failed to send reply" });
  }
});

module.exports = router;
