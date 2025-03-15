const { google } = require("googleapis");
const fs = require("fs");
const axios = require("axios");
const base64 = require("base-64");
const Email = require("./models/Email");

const CLIENT_ID = process.env.OUTLOOK_CLIENT_ID;
const CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET;
const REDIRECT_URI = process.env.OUTLOOK_REDIRECT_URI;
const AUTH_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const CREDENTIALS_PATH = "credentials.json";
const TOKEN_PATH = "token.json";

async function authenticateGmail() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
  } else {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
    });
    console.log("Authorize this app by visiting:", authUrl);
  }
  return oAuth2Client;
}

function getOutlookAuthUrl() {
  return `${AUTH_URL}?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&scope=Mail.Read`;
}

async function getOutlookToken(authCode) {
  const response = await axios.post(TOKEN_URL, {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "authorization_code",
    code: authCode,
    redirect_uri: REDIRECT_URI,
  });
  return response.data;
}

async function fetchGmailEmails(auth) {
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.messages.list({ userId: "me", maxResults: 10 });
  const messages = res.data.messages || [];

  let emailData = [];
  for (const msg of messages) {
    const msgDetail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
    });
    const headers = msgDetail.data.payload.headers;
    emailData.push({
      id: msg.id,
      subject: headers.find((header) => header.name === "Subject")?.value,
      from: headers.find((header) => header.name === "From")?.value,
      snippet: msgDetail.data.snippet,
    });
  }
  return emailData;
}

async function fetchOutlookSentEmails(accessToken) {
  const response = await axios.get(
    "https://graph.microsoft.com/v1.0/me/messages?$filter=folder eq 'SentItems'",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  return response.data.value || [];
}

async function sendEmailViaGmail(auth, toEmail, subject, body) {
  const gmail = google.gmail({ version: "v1", auth });

  const message = [`To: ${toEmail}`, `Subject: ${subject}`, "", body].join(
    "\n"
  );

  const encodedMessage = base64.encode(message);

  return await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage },
  });
}

async function saveEmail(emailData) {
  try {
    const email = new Email(emailData);
    await email.save();
    console.log("Email saved to database");
  } catch (error) {
    console.error("Error saving email:", error);
  }
}

module.exports = {
  authenticateGmail,
  getOutlookAuthUrl,
  getOutlookToken,
  fetchGmailEmails,
  fetchOutlookSentEmails,
  sendEmailViaGmail,
  saveEmail,
};
