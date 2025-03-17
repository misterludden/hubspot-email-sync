const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./database");
const emailRoutes = require("./routes/emailRoutes");
const authRoutes = require("./routes/authRoutes");
const gmailRoutes = require("./routes/gmailRoutes");
const emailProviderRoutes = require("./routes/emailProviderRoutes");
const attachmentRoutes = require("./routes/attachmentRoutes");

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(express.json({ limit: '50mb' })); // Increased payload limit
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Also handle URL-encoded data with increased limit
app.use(cors());

// Connect to MongoDB
connectDB();

// API Routes
app.use("/api", authRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/gmail", gmailRoutes); // Legacy route, will be deprecated
app.use("/api/email", emailProviderRoutes); // New generic email provider routes
app.use("/api/attachments", attachmentRoutes); // Routes for handling attachments

// Root endpoint
app.get("/", (req, res) => {
  res.send("HubSpot Email Sync API is running...");
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
