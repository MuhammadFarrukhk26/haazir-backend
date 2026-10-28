const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    service: { type: String, required: true }, // plumber, electrician, cctv, appliance
    serviceCategory: { type: String },
    subService: { type: String, default: '' },
    description: { type: String, default: '' },
    address: { type: String, required: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // STRICTLY [longitude, latitude]
    },
    slot: { type: String, default: 'now' },
    schedule: { type: Object },
    price: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'unfulfilled'],
      default: 'pending',
    },
    searchRadiusMeters: { type: Number, default: 0 },
    notifiedWorkers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    searchRound: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);