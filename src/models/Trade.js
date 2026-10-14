const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema(
  {
    _id: { type: Number, required: true }, // Simple IDs: 1, 2, 3...
    name: { type: String, required: true, unique: true, trim: true }, // e.g. "Electrician"
    icon: { type: String, default: null },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Trade', tradeSchema);