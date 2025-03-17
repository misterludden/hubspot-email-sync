const express = require("express");
const { google } = require("googleapis");
const { authenticateGoogle, SCOPES } = require("../config.js");
const Email = require("../models/Email");
const Token = require("../models/Token");

const router = express.Router();

// Retrieve stored tokens
const getStoredTokens = async (userEmail) => {
  console.log(`Fetching db token for ${userEmail}`);
  const tokenDoc = await Token.findOne({ userEmail });
  return tokenDoc ? tokenDoc.tokens : null;
};

// Step 1: Generate OAuth URL
router.get("/auth/gmail", async (req, res) => {
  try {
    const oauth2Client = await authenticateGoogle();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
    });
    res.json({ url: authUrl });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate authentication URL" });
  }
});

// Step 2: Handle OAuth Callback
router.get("/auth/google/callback", async (req, res) => {
  try {
    const { code } = req.query;
    const oauth2Client = await authenticateGoogle();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
    const userInfo = await oauth2.userinfo.get();
    const userEmail = userInfo.data.email;

    console.log("OAuth success! Storing tokens for:", userEmail);

    await Token.findOneAndUpdate({ userEmail }, { userEmail, tokens }, { upsert: true, new: true });

    // Redirect and store user email in localStorage on frontend
    res.redirect(`http://localhost:3000/settings?email=${encodeURIComponent(userEmail)}`);
  } catch (error) {
    console.error("OAuth authentication failed:", error);
    res.status(500).json({ error: "OAuth authentication failed", details: error.message });
  }
});

// Step 3: Provide Authentication Status
router.get("/auth/status", async (req, res) => {
  try {
    console.log("Checking authentication status...");

    const email = req.query.email; // Ensure frontend passes the email
    if (!email) {
      return res.json({ authenticated: false, message: "No email provided." });
    }

    const storedTokenDoc = await Token.findOne({ userEmail: email });
    if (!storedTokenDoc || !storedTokenDoc.tokens) {
      console.log("No stored tokens found for user.");
      return res.json({ authenticated: false });
    }

    const storedTokens = storedTokenDoc.tokens;
    const oauth2Client = await authenticateGoogle();
    oauth2Client.setCredentials(storedTokens);

    console.log("Stored tokens found. Checking expiration...");

    // Refresh token if expired
    if (storedTokens.expiry_date && storedTokens.expiry_date < Date.now()) {
      console.log("Token expired. Refreshing...");
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);

      // Update the stored tokens
      await Token.findOneAndUpdate({ userEmail: email }, { tokens: credentials });

      console.log("Token refreshed and updated.");
    }

    // Fetch user email from Google API to confirm authentication
    const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
    const userInfo = await oauth2.userinfo.get();

    console.log("User authenticated:", userInfo.data.email);

    res.json({ authenticated: true, email: userInfo.data.email });
  } catch (error) {
    console.error("Error fetching authentication status:", error);
    res.json({ authenticated: false });
  }
});

// Step 4: Handle Disconnect
router.post("/auth/disconnect", async (req, res) => {
  try {
    await Token.deleteOne({ userEmail: req.body.email });
    res.json({ success: true, message: "Disconnected successfully" });
  } catch (error) {
    res.status(500).json({ error: "Error disconnecting user" });
  }
});

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

// Step 5: Sync Gmail Data
// Track sync status
let syncCompleted = false;

router.post("/auth/sync", async (req, res) => {
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
            messageId: msgDetail.data.id, // Ensure messageId is extracted
            threadId: msgDetail.data.threadId, // Ensure threadId is extracted
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
router.get("/auth/sync-status", (req, res) => {
  res.json({ success: true, synced: syncCompleted });
});

// Update Email Sync and Sending Replies in authRoutes.js
router.post("/auth/send", async (req, res) => {
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

router.get("/emails/sync-inbox", async (req, res) => {
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

router.get("/emails/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const email = await Email.findOne({ messageId: id });

    if (!email) {
      return res.status(404).json({ error: "Email not found" });
    }

    // Fetch the full thread (all emails in the same thread)
    const threadMessages = await Email.find({ threadId: email.threadId }).sort({ timestamp: 1 });

    res.json({ success: true, email, thread: threadMessages });
  } catch (error) {
    console.error("Error fetching email thread:", error);
    res.status(500).json({ error: "Failed to fetch email thread", details: error.message });
  }
});

router.post("/auth/archive", async (req, res) => {
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
