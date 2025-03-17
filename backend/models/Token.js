const mongoose = require("mongoose");

const tokenSchema = new mongoose.Schema({
  userEmail: { type: String, required: true, unique: true },
  provider: { type: String, required: true, enum: ['gmail', 'outlook'] },
  tokens: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Create a compound index on userEmail and provider to ensure uniqueness
tokenSchema.index({ userEmail: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model("Token", tokenSchema);
