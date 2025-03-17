const mongoose = require("mongoose");

const tokenSchema = new mongoose.Schema({
  userEmail: { 
    type: String, 
    required: true,
    trim: true,
    lowercase: true
  },
  provider: { 
    type: String, 
    required: true, 
    enum: ['gmail', 'outlook'],
    lowercase: true
  },
  tokens: { 
    type: Object, 
    required: true
  },
  isValid: {
    type: Boolean,
    default: true
  },
  lastSyncTime: {
    type: Date
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Create a compound index on userEmail and provider to ensure uniqueness
tokenSchema.index({ userEmail: 1, provider: 1 }, { unique: true });

// Pre-save middleware to update timestamps
tokenSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-update middleware
tokenSchema.pre('findOneAndUpdate', function(next) {
  this._update.updatedAt = new Date();
  next();
});

// Instance method to check if token is valid and not expired
tokenSchema.methods.isValidAndActive = function() {
  return this.isValid && (!this.tokens.expiry_date || new Date(this.tokens.expiry_date) > new Date());
};

module.exports = mongoose.model("Token", tokenSchema);
