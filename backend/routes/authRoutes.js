const express = require("express");
const { google } = require("googleapis");
const { authenticateGoogle, SCOPES } = require("../config.js");

const router = express.Router();
let userTokens = null;
let userEmail = null;

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
    console.error("Error generating OAuth URL:", error);
    res.status(500).json({ error: "Failed to generate authentication URL" });
  }
});

// Step 2: Handle OAuth Callback
router.get("/auth/google/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      throw new Error("No authorization code returned from Google");
    }

    const oauth2Client = await authenticateGoogle();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    userTokens = tokens;

    console.log("OAuth tokens received:", tokens);
    // Fetch user email
    const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
    const userInfo = await oauth2.userinfo.get();
    userEmail = userInfo.data.email;
    console.log("Authenticated user email:", userEmail);
    res.redirect("http://localhost:3000/settings");
  } catch (error) {
    console.error("Error during OAuth callback:", error.response ? error.response.data : error);
    res.status(500).json({ error: "OAuth authentication failed", details: error.message });
  }
});

// Step 3: Provide Authentication Status
router.get("/auth/status", async (req, res) => {
  try {
    if (!userTokens) {
      return res.json({ authenticated: false });
    }

    const oauth2Client = await authenticateGoogle();
    oauth2Client.setCredentials(userTokens);

    // Refresh token if expired
    if (userTokens.expiry_date && userTokens.expiry_date < Date.now()) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      userTokens = credentials; // Store the refreshed token
      console.log("Token refreshed:", credentials);
    }

    const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
    const userInfo = await oauth2.userinfo.get();

    res.json({ authenticated: true, email: userInfo.data.email });
  } catch (error) {
    console.error("Error fetching authentication status:", error.response ? error.response.data : error);
    res.json({ authenticated: false });
  }
});

// Step 4: Handle Disconnect
router.post("/auth/disconnect", (req, res) => {
  userTokens = null;
  userEmail = null;
  res.json({ success: true, message: "Disconnected successfully" });
});

module.exports = router;
