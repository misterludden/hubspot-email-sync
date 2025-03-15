const express = require("express");
const Email = require("../models/Email");

const router = express.Router();

// Get all emails
router.get("/", async (req, res) => {
  try {
    const emails = await Email.find().sort({
      "replies.timestamp": -1, // Sort by most recent reply
      timestamp: -1, // If no replies, sort by email timestamp
    });

    res.json(emails);
  } catch (error) {
    console.error("Error fetching emails:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get a single email by ID
router.get("/:id", async (req, res) => {
  try {
    const email = await Email.findById(req.params.id);
    if (!email) return res.status(404).json({ message: "Email not found" });
    // Sort replies before sending
    email.replies.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(email);
  } catch (error) {
    res.status(500).json({ message: "Error fetching email", error });
  }
});

// Send a new email (Mock API for now)
router.post("/send", async (req, res) => {
  try {
    const { recipient, subject, body } = req.body;
    if (!recipient || !subject || !body) return res.status(400).json({ message: "Missing required fields" });

    // Mock email sending (You can integrate Gmail/Outlook API here)
    const newEmail = new Email({ sender: "you@example.com", recipient, subject, body, isInbound: false });
    await newEmail.save();

    res.status(201).json({ message: "Email sent successfully", email: newEmail });
  } catch (error) {
    res.status(500).json({ message: "Error sending email", error });
  }
});

// Add reply to an email thread
router.post("/:id/reply", async (req, res) => {
  try {
    console.log("reqParams:", JSON.stringify(req.params));
    console.log("Finding email with id:", req.params.id);
    const email = await Email.findById(req.params.id);
    if (!email) {
      return res.status(404).json({ error: "Email not found" });
    }

    console.log("Adding reply:", req.body);
    const { sender, message, isInbound } = req.body;
    if (!sender || !message) {
      return res.status(400).json({ error: "Sender and message are required" });
    }

    const reply = {
      sender, // Capture the sender from frontend
      body: message,
      timestamp: new Date(),
      isInbound: isInbound !== undefined ? isInbound : false, // Default to false if not provided
    };

    email.replies.push(reply); // Add the reply to the email thread
    await email.save();

    res.json({ success: true, email });
  } catch (error) {
    console.error("Error saving reply:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
