const mongoose = require('mongoose');

// Categories shown on the customer Home (services) screen.
// Separate from Trade: Trade = what a worker registers as; ServiceCategory = what a customer can book.
const serviceCategorySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true }, // saved on Booking.service, e.g. 'electrician'
    name: { type: String, required: true, trim: true },                                // 'Electrician'
    description: { type: String, default: '' },
    icon: { type: String, default: 'construct' },     // Ionicons name used by the app
    color: { type: String, default: '#FF3B30' },
    secondaryColor: { type: String, default: '#FFF1F0' },
    issues: { type: [String], default: [] },          // quick-pick common issues
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('ServiceCategory', serviceCategorySchema);