const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: '',
      trim: true,
    },
    // Useful for quick queries (e.g. 'customer_to_worker' or 'worker_to_customer')
    reviewType: {
      type: String,
      enum: ['customer_to_worker', 'worker_to_customer'],
      required: true,
    },
  },
  { timestamps: true }
);

// Prevent rating the same booking twice from the same user
ratingSchema.index({ booking: 1, fromUser: 1 }, { unique: true });

module.exports = mongoose.model('Rating', ratingSchema);