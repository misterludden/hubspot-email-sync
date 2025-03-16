const express = require("express");
const mongoose = require("mongoose");
const Email = require("../models/Email");

const router = express.Router();

// Get all emails
router.get("/", async (req, res) => {
  console.log("Hitting email API :fire:");
  try {
    const emails = await Email.find().sort({
      latestTimestamp: -1, // Sort emails by the most recent message
    });
    res.json(emails);
  } catch (error) {
    console.error("Error fetching emails:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get a single email thread by threadId
router.get("/:threadId", async (req, res) => {
  try {
    console.log("Fetching thread:", req.params.threadId);
    const emailThread = await Email.findOne({ threadId: req.params.threadId });
    if (!emailThread) return res.status(404).json({ message: "Thread not found" });

    emailThread.messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(emailThread);
  } catch (error) {
    console.error("Error fetching email thread:", error);
    res.status(500).json({ message: "Error fetching email thread", error });
  }
});

// Send a new email (Mock API for now)
router.post("/send", async (req, res) => {
  try {
    const { recipient, subject, body } = req.body;
    if (!recipient || !subject || !body) return res.status(400).json({ message: "Missing required fields" });

    const newEmail = new Email({
      threadId: new mongoose.Types.ObjectId().toString(),
      sender: "you@example.com",
      recipient,
      subject,
      messages: [
        {
          messageId: new mongoose.Types.ObjectId().toString(),
          sender: "you@example.com",
          recipient,
          subject,
          body,
          timestamp: new Date(),
          isInbound: false,
        },
      ],
      latestTimestamp: new Date(),
      participants: ["you@example.com", recipient],
    });
    await newEmail.save();

    res.status(201).json({ message: "Email sent successfully", email: newEmail });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ message: "Error sending email", error });
  }
});

// Add reply to an existing email thread
router.post("/:threadId/reply", async (req, res) => {
  try {
    console.log("Finding email thread with threadId:", req.params.threadId);
    const emailThread = await Email.findOne({ threadId: req.params.threadId });
    if (!emailThread) {
      return res.status(404).json({ error: "Email thread not found" });
    }

    console.log("Adding reply:", req.body);
    const { sender, body, isInbound } = req.body;
    if (!sender || !body) {
      return res.status(400).json({ error: "Sender and message body are required" });
    }

    const reply = {
      messageId: new mongoose.Types.ObjectId().toString(),
      sender,
      recipient: emailThread.participants.find((p) => p !== sender) || "unknown",
      subject: emailThread.subject,
      body,
      timestamp: new Date(),
      isInbound: isInbound !== undefined ? isInbound : false,
    };

    emailThread.messages.push(reply);
    emailThread.latestTimestamp = reply.timestamp;
    await emailThread.save();

    res.json({ success: true, emailThread });
  } catch (error) {
    console.error("Error saving reply:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
