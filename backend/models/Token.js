const mongoose = require("mongoose");

const tokenSchema = new mongoose.Schema({
  userEmail: { type: String, required: true, unique: true },
  tokens: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Token", tokenSchema);
