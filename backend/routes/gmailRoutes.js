const express = require("express");
const { google } = require("googleapis");
const { authenticateGoogle } = require("../config.js");
const Email = require("../models/Email");
const Token = require("../models/Token");

const router = express.Router();

// Retrieve stored tokens (helper function)
const getStoredTokens = async (userEmail) => {
  console.log(`Fetching db token for ${userEmail}`);
  const tokenDoc = await Token.findOne({ userEmail });
  return tokenDoc ? tokenDoc.tokens : null;
};

// Helper function to get authenticated Gmail client
const getAuthenticatedGmailClient = async (userEmail) => {
  const storedTokens = await getStoredTokens(userEmail);
  if (!storedTokens) throw new Error("OAuth tokens missing. Please reconnect your account.");

  const oauth2Client = await authenticateGoogle();
  oauth2Client.setCredentials(storedTokens);

  if (storedTokens.expiry_date && storedTokens.expiry_date < Date.now()) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    await Token.findOneAndUpdate({ userEmail }, { tokens: credentials });
  }

  return google.gmail({ version: "v1", auth: oauth2Client });
};

// Track sync status
let syncCompleted = false;

// Sync Gmail Data
router.post("/sync", async (req, res) => {
  try {
    const userEmail = req.body.email || req.query.email || req.session?.userEmail || null;

    if (!userEmail) {
      return res.status(400).json({ error: "User email is required for sync." });
    }
    const gmail = await getAuthenticatedGmailClient(userEmail);
    if (!gmail) {
      return res.status(401).json({ error: "OAuth tokens missing. Please reconnect your account." });
    }

    const days = req.body.days || 1;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const query = `after:${Math.floor(sinceDate.getTime() / 1000)}`;

    console.log(`Fetching messages for ${userEmail} from Gmail API...`);
    const messagesResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 100,
    });

    const messages = messagesResponse.data.messages || [];
    console.log(`Processing ${messages.length} messages...`);

    if (messages.length === 0) {
      syncCompleted = true;
      return res.json({ success: true, message: "No messages found for sync." });
    }

    const messageDetails = await Promise.all(
      messages.map(async (msg) => {
        try {
          if (!msg.id || !msg.threadId) {
            console.warn("Skipping message with missing messageId or threadId:", msg);
            return null;
          }

          const msgDetail = await gmail.users.messages.get({ userId: "me", id: msg.id });
          const headers = msgDetail.data.payload.headers;

          const getHeader = (name) => headers.find((header) => header.name === name)?.value || "";

          const messageObj = {
            messageId: msgDetail.data.id,
            threadId: msgDetail.data.threadId,
            sender: getHeader("From"),
            recipient: getHeader("To"),
            subject: getHeader("Subject"),
            body: msgDetail.data.snippet,
            timestamp: new Date(parseInt(msgDetail.data.internalDate)).toISOString(),
            isInbound: getHeader("From") !== userEmail,
          };

          if (!messageObj.messageId) {
            console.warn("Skipping message due to missing messageId:", messageObj);
            return null;
          }

          return messageObj;
        } catch (error) {
          console.error("Error processing message: ", error);
          return null;
        }
      })
    );

    // Ensure valid messages are assigned properly before inserting into DB
    const validMessages = messageDetails.filter((msg) => msg !== null && msg.messageId);
    console.log(`Valid messages to insert: ${validMessages.length}`);

    for (const message of validMessages) {
      console.log(`Saving message: ${message.messageId} | Subject: ${message.subject}`);

      // Check if the message already exists in the thread
      const existingMessage = await Email.findOne({ "messages.messageId": message.messageId });
      if (existingMessage) {
        console.log(`Skipping duplicate message: ${message.messageId}`);
        continue;
      }

      // Upsert thread and add messages without duplication
      await Email.findOneAndUpdate(
        { threadId: message.threadId },
        {
          $setOnInsert: { threadId: message.threadId, subject: message.subject },
          $addToSet: {
            participants: { $each: [message.sender, message.recipient] },
          },
          $push: { messages: message },
        },
        { upsert: true }
      );
    }

    syncCompleted = true;
    res.json({ success: true, message: "Inbox sync completed successfully." });
  } catch (error) {
    console.error("Error syncing inbox:", error);
    res.status(500).json({ error: "Inbox sync failed", details: error.message });
  }
});

// Check sync status
router.get("/sync-status", (req, res) => {
  res.json({ success: true, synced: syncCompleted });
});

// Send email
router.post("/send", async (req, res) => {
  try {
    const userEmail = req.query.email;
    const gmail = await getAuthenticatedGmailClient(userEmail);
    if (!gmail) {
      return res.status(401).json({ error: "OAuth tokens missing. Please reconnect your account." });
    }

    const { emailId, recipient, subject, body } = req.body;
    const emailContent = `To: ${recipient}\nSubject: ${subject}\nContent-Type: text/plain; charset="UTF-8"\n\n${body}`;
    const encodedMessage = Buffer.from(emailContent).toString("base64");

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    });

    // Add the reply to the thread in the database
    await Email.updateOne(
      { messageId: emailId },
      { $push: { replies: { sender: userEmail, recipient, subject, body, timestamp: new Date().toISOString() } } }
    );

    res.json({ success: true, message: "Email sent successfully", data: response.data });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Failed to send email", details: error.message });
  }
});

// Sync inbox (alternative endpoint)
router.get("/sync-inbox", async (req, res) => {
  try {
    const userEmail = req.query.email;
    const gmail = await getAuthenticatedGmailClient(userEmail);
    if (!gmail) {
      return res.status(401).json({ error: "OAuth tokens missing. Please reconnect your account." });
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 1);
    const query = `after:${Math.floor(sinceDate.getTime() / 1000)}`;

    const messagesResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 50,
    });

    const messages = messagesResponse.data.messages || [];

    if (messages.length === 0) {
      return res.json({ success: true, message: "No new messages found.", data: [] });
    }

    const newMessages = await Promise.all(
      messages.map(async (msg) => {
        const msgDetail = await gmail.users.messages.get({ userId: "me", id: msg.id });
        const headers = msgDetail.data.payload.headers;

        const getHeader = (name) => headers.find((header) => header.name === name)?.value || "";

        return {
          messageId: msgDetail.data.id,
          threadId: msgDetail.data.threadId,
          sender: getHeader("From"),
          recipient: getHeader("To"),
          subject: getHeader("Subject"),
          body: msgDetail.data.snippet,
          timestamp: new Date(parseInt(msgDetail.data.internalDate)).toISOString(),
          isInbound: getHeader("From") !== userEmail,
          isRead: !msgDetail.data.labelIds.includes("UNREAD"), // Check Gmail API labels
        };
      })
    );

    for (const message of newMessages) {
      await Email.updateOne(
        { threadId: message.threadId },
        {
          $set: {
            subject: message.subject,
            latestTimestamp: message.timestamp,
          },
          $addToSet: { participants: { $each: [message.sender, message.recipient] } },
          $push: {
            messages: {
              messageId: message.messageId,
              sender: message.sender,
              recipient: message.recipient,
              body: message.body,
              timestamp: message.timestamp,
              isInbound: message.isInbound,
            },
          },
        },
        { upsert: true }
      );
    }

    res.json({ success: true, message: "Inbox synced successfully", data: newMessages });
  } catch (error) {
    console.error("Error syncing inbox:", error);
    res.status(500).json({ error: "Failed to sync inbox", details: error.message, data: [] });
  }
});

// Archive email
router.post("/archive", async (req, res) => {
  try {
    const { threadId, email } = req.body;
    if (!threadId || !email) return res.status(400).json({ error: "Thread ID and email are required" });

    const gmail = await getAuthenticatedGmailClient(email);
    if (!gmail) return res.status(401).json({ error: "OAuth tokens missing. Please reconnect your account." });

    // Remove "INBOX" label in Gmail (Archiving)
    await gmail.users.messages.modify({
      userId: "me",
      id: threadId,
      requestBody: { removeLabelIds: ["INBOX"] },
    });

    // Update MongoDB
    await Email.findOneAndUpdate({ threadId }, { isArchived: true });

    res.json({ success: true, message: "Email archived successfully" });
  } catch (error) {
    console.error("Error archiving email:", error);
    res.status(500).json({ error: "Failed to archive email", details: error.message });
  }
});

module.exports = router;
