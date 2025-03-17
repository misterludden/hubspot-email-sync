const express = require("express");
const mongoose = require("mongoose");
const Email = require("../models/Email");
const EmailServiceFactory = require("../services/emailServiceFactory");

const router = express.Router();

// Download an attachment
router.get("/:messageId/:filename", async (req, res) => {
  try {
    const { messageId, filename } = req.params;
    const userEmail = req.query.email;
    const provider = req.query.provider || "gmail";
    
    if (!userEmail) {
      return res.status(400).json({ error: "User email is required" });
    }

    // Find the email message containing this attachment
    const email = await Email.findOne({ 
      "messages.messageId": messageId,
      provider
    });

    if (!email) {
      return res.status(404).json({ error: "Email not found" });
    }

    const message = email.messages.find(m => m.messageId === messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const attachment = message.attachments.find(a => a.filename === filename);
    if (!attachment) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    // Get the email service for this provider
    const emailService = EmailServiceFactory.getService(provider);
    
    // Download the attachment from the provider
    const attachmentData = await emailService.downloadAttachment(userEmail, messageId, attachment.contentId || filename);
    
    if (!attachmentData || !attachmentData.content) {
      return res.status(404).json({ error: "Attachment content not found" });
    }

    // Set the appropriate headers
    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    
    // Send the attachment content
    const buffer = Buffer.from(attachmentData.content, "base64");
    res.send(buffer);
  } catch (error) {
    console.error("Error downloading attachment:", error);
    res.status(500).json({ error: "Failed to download attachment" });
  }
});

module.exports = router;
