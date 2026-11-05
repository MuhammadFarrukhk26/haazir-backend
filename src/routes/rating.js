const router = require('express').Router();
const Booking = require('../models/Booking');
const Rating = require('../models/Rating');
const User = require('../models/User');
const updateUserRating = require('../utils/updateUserRating');

// POST /api/ratings
router.post('/', async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;
    const fromUserId = req.userId; // Extracted from auth middleware

    // 1. Validation
    if (!bookingId || !rating) {
      return res.status(400).json({ error: 'bookingId and rating are required.' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    }

    // 2. Fetch booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    if (booking.status !== 'completed') {
      return res.status(400).json({ error: 'Ratings can only be submitted for completed bookings.' });
    }

    // 3. Determine target user (toUser) & review type
    let toUserId;
    let reviewType;

    if (booking.customer.toString() === fromUserId) {
      // Customer is rating the Worker
      toUserId = booking.worker;
      reviewType = 'customer_to_worker';
    } else if (booking.worker && booking.worker.toString() === fromUserId) {
      // Worker is rating the Customer
      toUserId = booking.customer;
      reviewType = 'worker_to_customer';
    } else {
      return res.status(403).json({ error: 'You are not authorized to rate this booking.' });
    }

    if (!toUserId) {
      return res.status(400).json({ error: 'Target user for this rating does not exist.' });
    }

    // 4. Create Rating document
    const ratingDoc = new Rating({
      booking: bookingId,
      fromUser: fromUserId,
      toUser: toUserId,
      rating: Number(rating),
      comment: comment ? comment.trim() : '',
      reviewType,
    });

    await ratingDoc.save();

    // 5. Recalculate target user's average rating in background
    await updateUserRating(toUserId);

    res.status(201).json({
      message: 'Rating submitted successfully.',
      rating: ratingDoc,
    });
  } catch (err) {
    // Duplicate rating check
    if (err.code === 11000) {
      return res.status(400).json({ error: 'You have already rated this booking.' });
    }
    console.error('Submit Rating Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;