const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const session = require("express-session");
const connectDB = require("./database");
const emailRoutes = require("./routes/emailRoutes");
const authRoutes = require("./routes/authRoutes");
const gmailRoutes = require("./routes/gmailRoutes");
const emailProviderRoutes = require("./routes/emailProviderRoutes");
const attachmentRoutes = require("./routes/attachmentRoutes");
const hubspotRoutes = require("./routes/hubspotRoutes");
const hubspotIntegrationRoutes = require("./routes/hubspotIntegrationRoutes");

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(express.json({ limit: '50mb' })); // Increased payload limit
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Also handle URL-encoded data with increased limit
app.use(cors());

// Session middleware for storing user data during OAuth flow
app.use(session({
  secret: process.env.SESSION_SECRET || 'hubspot-email-sync-secret',
  resave: true,  // Changed to true to ensure session is saved on every request
  saveUninitialized: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax'  // Allow cookies to be sent on redirects from external sites
  }
}));

// API endpoint to store user email in session
app.post('/api/session', (req, res) => {
  const { userEmail } = req.body;
  if (!userEmail) {
    return res.status(400).json({ success: false, error: 'User email is required' });
  }
  
  // Store user email in session
  req.session.userEmail = userEmail;
  console.log('User email stored in session:', userEmail);
  
  // Force session save to ensure it's persisted immediately
  req.session.save((err) => {
    if (err) {
      console.error('Error saving session:', err);
      return res.status(500).json({ success: false, error: 'Failed to save session' });
    }
    res.json({ success: true });
  });
});

// Connect to MongoDB
connectDB();

// API Routes
app.use("/api", authRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/gmail", gmailRoutes); // Legacy route, will be deprecated
app.use("/api/email", emailProviderRoutes); // New generic email provider routes
app.use("/api/attachments", attachmentRoutes); // Routes for handling attachments
app.use("/api", hubspotRoutes); // HubSpot OAuth routes
app.use("/api", hubspotIntegrationRoutes); // HubSpot CRM integration routes

// Root endpoint
app.get("/", (req, res) => {
  res.send("HubSpot Email Sync API is running...");
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
