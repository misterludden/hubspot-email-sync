const express = require("express");
const emailServiceFactory = require("../services/emailServiceFactory");
const classificationService = require("../services/classificationService");
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

    // Mark all unread messages in this thread as read
    const updatedMessages = emailThread.messages.map(msg => {
      if (!msg.isRead) {
        msg.isRead = true;
      }
      return msg;
    });

    // Update the thread with read messages
    await Email.updateOne(
      { _id: emailThread._id },
      { $set: { messages: updatedMessages } }
    );

    // Also update the read status in the email provider if needed
    try {
      const emailService = emailServiceFactory.getService(req.provider);
      // Only call markAsRead if the method exists in the service
      if (typeof emailService.markAsRead === 'function') {
        await emailService.markAsRead(req.userEmail, req.params.threadId);
      }
    } catch (markReadError) {
      console.warn(`Warning: Could not mark thread as read in provider: ${markReadError.message}`);
      // Don't fail the request if marking as read fails
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
    
    // After sending the reply, classify the thread to include the new message
    try {
      await classificationService.classifyThread(threadId, req.provider, req.userEmail);
    } catch (classifyError) {
      console.warn(`Warning: Could not classify thread after reply: ${classifyError.message}`);
      // Don't fail the reply if classification fails
    }
    
    res.json(result);
  } catch (error) {
    console.error(`Error sending ${req.provider} reply:`, error);
    res.status(500).json({ error: "Failed to send reply" });
  }
});

// Classify a single email thread
router.post("/:provider/classify/:threadId", validateProvider, validateAuth, async (req, res) => {
  try {
    const { threadId } = req.params;
    
    const classifiedEmail = await classificationService.classifyThread(
      threadId,
      req.provider,
      req.userEmail
    );
    
    res.json({
      success: true,
      threadId,
      classification: classifiedEmail.classification
    });
  } catch (error) {
    console.error(`Error classifying thread:`, error);
    res.status(500).json({ error: "Failed to classify thread", details: error.message });
  }
});

// Classify all email threads for a user
router.post("/:provider/classify-all", validateProvider, validateAuth, async (req, res) => {
  try {
    const classifiedCount = await classificationService.classifyAllThreads(
      req.userEmail,
      req.provider
    );
    
    res.json({
      success: true,
      classifiedCount,
      message: `Successfully classified ${classifiedCount} email threads`
    });
  } catch (error) {
    console.error(`Error classifying all threads:`, error);
    res.status(500).json({ error: "Failed to classify threads", details: error.message });
  }
});

// Get classification for a thread
router.get("/:provider/classification/:threadId", validateProvider, validateAuth, async (req, res) => {
  try {
    const { threadId } = req.params;
    
    const email = await Email.findOne({
      threadId,
      provider: req.provider,
      userEmail: req.userEmail
    });
    
    if (!email) {
      return res.status(404).json({ error: "Thread not found" });
    }
    
    // If thread doesn't have classification yet, classify it
    if (!email.classification || !email.classification.dominantTopic) {
      await classificationService.classifyThread(threadId, req.provider, req.userEmail);
      // Reload the email after classification
      const updatedEmail = await Email.findOne({
        threadId,
        provider: req.provider,
        userEmail: req.userEmail
      });
      
      if (!updatedEmail) {
        return res.status(404).json({ error: "Thread not found after classification" });
      }
      
      res.json({
        threadId,
        classification: updatedEmail.classification,
        messageClassifications: updatedEmail.messages.map(msg => ({
          messageId: msg.messageId,
          classification: msg.classification
        }))
      });
    } else {
      // Return existing classification
      res.json({
        threadId,
        classification: email.classification,
        messageClassifications: email.messages.map(msg => ({
          messageId: msg.messageId,
          classification: msg.classification
        }))
      });
    }
  } catch (error) {
    console.error(`Error getting classification:`, error);
    res.status(500).json({ error: "Failed to get classification", details: error.message });
  }
});

// Mark a message as read
router.post("/:provider/mark-read/:threadId", validateProvider, validateAuth, async (req, res) => {
  try {
    const { threadId } = req.params;
    const { messageId } = req.body;
    
    if (!threadId) {
      return res.status(400).json({ error: "Thread ID is required" });
    }
    
    const query = { 
      threadId,
      provider: req.provider,
      userEmail: req.userEmail
    };
    
    // If messageId is provided, only mark that specific message as read
    // Otherwise, mark all messages in the thread as read
    let updateOperation;
    if (messageId) {
      updateOperation = {
        $set: { "messages.$[elem].isRead": true }
      };
      var options = {
        arrayFilters: [{ "elem.messageId": messageId }]
      };
    } else {
      updateOperation = {
        $set: { "messages.$[].isRead": true }
      };
      var options = {};
    }
    
    const result = await Email.updateOne(query, updateOperation, options);
    
    // Also update the read status in the email provider
    try {
      const emailService = emailServiceFactory.getService(req.provider);
      // Only call markAsRead if the method exists in the service
      if (typeof emailService.markAsRead === 'function') {
        await emailService.markAsRead(req.userEmail, threadId, messageId);
      }
    } catch (markReadError) {
      console.warn(`Warning: Could not mark thread as read in provider: ${markReadError.message}`);
      // Don't fail the request if marking as read fails
    }
    
    res.json({
      success: true,
      message: messageId ? "Message marked as read" : "Thread marked as read",
      modifiedCount: result.nModified
    });
  } catch (error) {
    console.error(`Error marking thread as read:`, error);
    res.status(500).json({ error: "Failed to mark thread as read", details: error.message });
  }
});

// Force sync emails for a user
router.post("/:provider/sync", validateProvider, validateAuth, async (req, res) => {
  try {
    const { days = 7 } = req.body; // Default to syncing last 7 days
    
    const emailService = emailServiceFactory.getService(req.provider);
    const result = await emailService.syncEmails(req.userEmail, { days, forceFull: true });
    
    res.json({
      success: true,
      message: "Email sync initiated",
      result
    });
  } catch (error) {
    console.error(`Error syncing emails:`, error);
    res.status(500).json({ error: "Failed to sync emails", details: error.message });
  }
});

// Poll for recent messages (used by frontend polling mechanism)
router.post("/:provider/poll", validateProvider, validateAuth, async (req, res) => {
  try {
    console.log(`Polling for recent messages for ${req.userEmail}...`);
    
    const emailService = emailServiceFactory.getService(req.provider);
    // Use polling mode (not forceFull) to get only recent messages
    const result = await emailService.syncEmails(req.userEmail, { polling: true });
    
    // After syncing, get all emails to return to the client
    const emails = await Email.find({ 
      provider: req.provider,
      userEmail: req.userEmail
    }).sort({ latestTimestamp: -1 });
    
    res.json({
      success: true,
      message: "Poll completed successfully",
      emails: emails
    });
  } catch (error) {
    console.error(`Error polling for new messages:`, error);
    res.status(500).json({ error: "Failed to poll for new messages", details: error.message });
  }
});

// Archive a thread
router.post("/:provider/archive/:threadId", validateProvider, validateAuth, async (req, res) => {
  try {
    const { threadId } = req.params;
    
    if (!threadId) {
      return res.status(400).json({ error: "Thread ID is required" });
    }
    
    // Mark the thread as archived in our database
    const result = await Email.findOneAndUpdate(
      { 
        threadId,
        provider: req.provider,
        userEmail: req.userEmail
      },
      { $set: { isArchived: true } },
      { new: true }
    );
    
    if (!result) {
      return res.status(404).json({ error: "Thread not found" });
    }
    
    // Also archive in the provider if the method exists
    try {
      const emailService = emailServiceFactory.getService(req.provider);
      if (typeof emailService.archiveThread === 'function') {
        await emailService.archiveThread(req.userEmail, threadId);
      }
    } catch (archiveError) {
      console.warn(`Warning: Could not archive thread in provider: ${archiveError.message}`);
      // Don't fail the request if provider archiving fails
    }
    
    res.json({
      success: true,
      message: "Thread archived successfully",
      threadId
    });
  } catch (error) {
    console.error(`Error archiving thread:`, error);
    res.status(500).json({ error: "Failed to archive thread", details: error.message });
  }
});

module.exports = router;
