const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  messageId: { type: String, required: true, unique: true },
  sender: String,
  recipient: String,
  subject: String,
  body: String,
  timestamp: Date,
  isInbound: Boolean,
});

const emailSchema = new mongoose.Schema({
  threadId: { type: String, required: true, unique: true }, // One entry per thread
  subject: String,
  participants: [String], // Keep track of all participants
  latestTimestamp: Date, // Timestamp of the latest message
  messages: [messageSchema], // Store all thread messages in one document
});

module.exports = mongoose.model("Email", emailSchema);
