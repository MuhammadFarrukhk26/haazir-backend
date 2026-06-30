const express = require('express');
const Booking = require('../models/Booking');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/messages/:bookingId — full chat history for a booking
router.get('/:bookingId', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const isParticipant =
      booking.customer.toString() === req.userId ||
      (booking.worker && booking.worker.toString() === req.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'You are not part of this booking' });
    }

    const messages = await Message.find({ booking: req.params.bookingId })
      .sort({ createdAt: 1 })
      .limit(200);

    res.json({ messages });
  } catch (err) {
    console.error('[messages/history]', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

module.exports = router;
