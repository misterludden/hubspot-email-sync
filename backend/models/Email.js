const mongoose = require("mongoose");

const EmailSchema = new mongoose.Schema({
  sender: String,
  recipient: String,
  subject: String,
  body: String,
  timestamp: Date,
  messageId: { type: String, unique: true },
  labels: [String],
  isInbound: Boolean,
  replies: [
    {
      sender: String,
      recipient: String,
      body: String,
      timestamp: Date,
      isInbound: Boolean,
    },
  ],
});

module.exports = mongoose.model("Email", EmailSchema);
