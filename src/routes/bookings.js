const express = require('express');
const Booking = require('../models/Booking');
const User = require('../models/User');
// const Trade = require('../models/Trade');
const ServiceCategory = require('../models/ServiceCategory');
const authMiddleware = require('../middleware/auth');
const { runRing, continueSearch } = require('../services/dispatch');

const router = express.Router();
router.use(authMiddleware);

const DEFAULT_PRICE = 250; // CHANGED: fallback only, real prices now live on Trade.basePrice


const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// CHANGED: allowed status moves (blocks things like cancelled -> completed)
const TRANSITIONS = {
  pending: ['cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
};

// POST /api/bookings: customer creates a new booking request
router.post('/', async (req, res) => {
  try {
    const {
      service,
      serviceCategory,
      subService,
      address,
      description,
      details,
      lat,
      lng,
      slot,
      schedule,
    } = req.body;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'Valid lat and lng coordinates are required.' });
    }

    const activeService = service || serviceCategory;
    const activeDescription = description || details || '';

    if (!activeService) {
      return res.status(400).json({ error: 'Service category is required.' });
    }
    if (!address) {
      return res.status(400).json({ error: 'Address is required.' });
    }

    
    const category = await ServiceCategory.findOne({
      key: String(activeService).toLowerCase().trim(),
    });

    const price = category?.basePrice ?? DEFAULT_PRICE;

    const booking = new Booking({
      customer: req.userId,
      service: activeService,
      subService: subService || '',
      address,
      description: activeDescription,
      slot: slot || 'now',
      schedule,
      location: {
        type: 'Point',
        coordinates: [Number(lng), Number(lat)], // GeoJSON: longitude first
      },
      price, // CHANGED
      status: 'pending',
    });

    await booking.save();

    const io = req.app.get('io');
    if (io) {
      runRing(io, booking._id, 0);
    }

    res.status(201).json(booking);
  } catch (err) {
    console.error('[POST /bookings] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bookings/active
router.get('/active', async (req, res) => {
  try {
    const filter =
      req.userRole === 'customer'
        ? { customer: req.userId, status: { $in: ['pending', 'assigned', 'in_progress'] } }
        : { worker: req.userId, status: { $in: ['assigned', 'in_progress'] } };

    const booking = await Booking.findOne(filter)
      .populate('customer', 'name phone avatar rating')
      .populate('worker', 'name phone avatar rating specialty')
      .sort({ createdAt: -1 });

    res.json({ booking: booking || null });
  } catch (err) {
    console.error('[bookings/active]', err);
    res.status(500).json({ error: 'Failed to fetch active booking' });
  }
});

// GET /api/bookings/history
router.get('/history', async (req, res) => {
  try {
    const filter =
      req.userRole === 'customer'
        ? { customer: req.userId, status: { $in: ['completed', 'cancelled'] } }
        : { worker: req.userId, status: { $in: ['completed', 'cancelled'] } };

    // CHANGED: removed the duplicated populate() lines
    const bookings = await Booking.find(filter)
      .populate('customer', 'name phone avatar rating')
      .populate('worker', 'name phone avatar rating specialty')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ bookings });
  } catch (err) {
    console.error('[bookings/history]', err);
    res.status(500).json({ error: 'Failed to fetch booking history' });
  }
});

// GET /api/bookings/invites: pending jobs matching worker trade and location
router.get('/invites', async (req, res) => {
  try {
    const worker = await User.findById(req.userId);
    // CHANGED: also stops blocked/unverified workers and workers with no trade
    if (
      !worker ||
      worker.isBlocked ||
      worker.verificationStatus !== 'approved' ||
      !worker.location?.coordinates ||
      !worker.specialtyName
    ) {
      return res.json([]);
    }

    const invites = await Booking.aggregate([
      {
        $geoNear: {
          near: worker.location,
          distanceField: 'distanceMeters',
          spherical: true,
          query: {
            status: 'pending',
            service: {
              $regex: `^${escapeRegex(worker.specialtyName)}$`,
              $options: 'i',
            },
          },
        },
      },
      {
        $match: {
          $expr: { $lte: ['$distanceMeters', '$searchRadiusMeters'] },
        },
      },
    ]);

    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/bookings/:id/accept
router.patch('/:id/accept', async (req, res) => {
  try {
    if (req.userRole !== 'worker') {
      return res.status(403).json({ error: 'Only workers can accept jobs' });
    }

    // CHANGED: blocked / unverified workers cannot accept
    const me = await User.findById(req.userId).select('isBlocked verificationStatus');
    if (!me || me.isBlocked) {
      return res.status(403).json({ error: 'Your account has been suspended' });
    }
    if (me.verificationStatus !== 'approved') {
      return res.status(403).json({ error: 'Your account is pending verification' });
    }

    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { worker: req.userId, status: 'assigned', assignedAt: new Date() }, // CHANGED: assignedAt
      { new: true }
    )
      .populate('customer', 'name phone avatar rating')
      .populate('worker', 'name phone avatar rating specialty');

    if (!booking) {
      return res.status(409).json({ error: 'This job is no longer available' });
    }

    // CHANGED: atomic increment instead of load + save
    await User.updateOne({ _id: req.userId }, { $inc: { trips: 1 } });

    const io = req.app.get('io');
    if (io) {
      const customerId = booking.customer?._id
        ? booking.customer._id.toString()
        : booking.customer.toString();

      io.to(`user:${customerId}`).emit('booking:updated', { booking });
      io.to('workers:online').emit('job:taken', { bookingId: booking._id });
    }

    res.json({ booking });
  } catch (err) {
    console.error('[bookings/accept]', err);
    res.status(500).json({ error: 'Failed to accept job' });
  }
});

// PATCH /api/bookings/:id/status: in_progress, completed, cancelled
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, rating, feedback, reason } = req.body;
    const allowed = ['in_progress', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // CHANGED: one participant check instead of two
    const isCustomer = booking.customer.toString() === req.userId;
    const isWorker = booking.worker && booking.worker.toString() === req.userId;
    if (!isCustomer && !isWorker) {
      return res.status(403).json({ error: 'You are not part of this booking' });
    }

    let ratingValue = null;
    if (rating != null) {
      ratingValue = Number(rating);
      if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
        return res.status(400).json({ error: 'rating must be an integer between 1 and 5' });
      }
    }

    // CHANGED: transition guard (a repeated 'completed' is allowed only to submit a review)
    const isReviewOnly =
      booking.status === 'completed' && status === 'completed' && ratingValue !== null;
    if (!isReviewOnly && !TRANSITIONS[booking.status]?.includes(status)) {
      return res
        .status(409)
        .json({ error: `Cannot change a ${booking.status} booking to ${status}` });
    }

    const wasPending = booking.status === 'pending';

    // CHANGED: timestamps and cancel tracking
    if (!isReviewOnly) {
      booking.status = status;
      const now = new Date();
      if (status === 'in_progress') booking.startedAt = now;
      if (status === 'completed') booking.completedAt = now;
      if (status === 'cancelled') {
        booking.cancelledAt = now;
        booking.cancelledBy = isCustomer ? 'customer' : 'worker';
        booking.cancelReason = (reason || '').trim();
      }
    }

    if (status === 'completed' && ratingValue !== null) {
      const review = {
        rating: ratingValue,
        feedback: (feedback || '').trim(),
        ratedAt: new Date(),
      };
      if (isCustomer) booking.workerReview = review;
      else booking.customerReview = review;
    }

    await booking.save();

    const populated = await booking.populate([
      { path: 'customer', select: 'name phone avatar rating' },
      { path: 'worker', select: 'name phone avatar rating specialty' },
    ]);

    const io = req.app.get('io');
    if (io) {
      const customerId = populated.customer?._id
        ? populated.customer._id.toString()
        : populated.customer.toString();

      const workerId = populated.worker?._id
        ? populated.worker._id.toString()
        : populated.worker?.toString();

      io.to(`user:${customerId}`).emit('booking:updated', { booking: populated });
      if (workerId) {
        io.to(`user:${workerId}`).emit('booking:updated', { booking: populated });
      }

      // CHANGED: if a still-searching booking is cancelled, tell workers to drop the card
      if (wasPending && status === 'cancelled') {
        io.to('workers:online').emit('job:taken', { bookingId: booking._id });
      }
    }

    res.json({ booking: populated });
  } catch (err) {
    console.error('[bookings/status]', err);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
});

// PATCH /api/bookings/:id/continue
router.patch('/:id/continue', async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, customer: req.userId });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const ok = await continueSearch(req.app.get('io'), booking._id);
    if (!ok) return res.status(409).json({ error: 'Booking is no longer pending' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to continue search' });
  }
});

module.exports = router;