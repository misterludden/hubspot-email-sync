const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema({
  filename: String,
  mimeType: String,
  size: Number,
  contentId: String,
});

const messageSchema = new mongoose.Schema({
  messageId: { type: String, required: true },
  sender: String,
  recipient: String,
  subject: String,
  body: String,
  timestamp: Date,
  isInbound: Boolean,
  isRead: { type: Boolean, default: false },
  isHtml: { type: Boolean, default: false },
  attachments: [attachmentSchema],
  provider: { type: String, required: true, default: 'gmail' },
  classification: {
    sentiment: { type: String, enum: ['Positive', 'Neutral', 'Negative'], default: 'Neutral' },
    sentimentScore: { type: Number, default: 0 },
    topic: { type: String, default: 'General' },
    priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Low' },
    keywords: [String]
  }
});

const emailSchema = new mongoose.Schema({
  threadId: { type: String, required: true }, // Thread ID from the email provider
  userEmail: { type: String, required: true, lowercase: true }, // User's email address
  subject: String,
  participants: [String], // Keep track of all participants
  latestTimestamp: Date, // Timestamp of the latest message
  messages: [messageSchema], // Store all thread messages in one document
  isArchived: { type: Boolean, default: false },
  provider: { type: String, required: true, enum: ['gmail', 'outlook'] },
  // Thread-level classification (derived from the most recent or highest priority message)
  classification: {
    dominantSentiment: { type: String, enum: ['Positive', 'Neutral', 'Negative'], default: 'Neutral' },
    dominantTopic: { type: String, default: 'General' },
    highestPriority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Low' },
    keyTopics: [String]
  }
});

// Create compound index for threadId, provider, and userEmail
// This ensures that the same thread can exist for different providers and users
emailSchema.index({ threadId: 1, provider: 1, userEmail: 1 }, { unique: true, background: true });

// Add additional non-unique indices to improve query performance
emailSchema.index({ userEmail: 1, provider: 1 }, { background: true });
emailSchema.index({ latestTimestamp: -1 }, { background: true });

// IMPORTANT: We do NOT create any single-field index on threadId to avoid conflicts

module.exports = mongoose.model("Email", emailSchema);
