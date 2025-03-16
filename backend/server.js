const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./database");
const emailRoutes = require("./routes/emailRoutes");
const authRoutes = require("./routes/authRoutes");

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Connect to MongoDB
connectDB();

// API Routes
app.use("/api", authRoutes);
app.use("/api/emails", emailRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.send("HubSpot Email Sync API is running...");
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
