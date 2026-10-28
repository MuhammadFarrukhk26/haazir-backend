const express = require('express');
const Booking = require('../models/Booking');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { runRing, continueSearch } = require('../services/dispatch');

const router = express.Router();
router.use(authMiddleware);

const SERVICE_BASE_PRICE = {
  electrician: 15,
  plumber: 18,
  cctv: 25,
  appliance: 20,
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// POST /api/bookings  — customer creates a new booking request
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
    console.log('[POST /bookings] body:', JSON.stringify(req.body));
    // Validate coordinates
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'Valid lat and lng coordinates are required.' });
    }

    // Fallback logic so both 'service' or 'serviceCategory' work seamlessly
    const activeService = service || serviceCategory;
    const activeDescription = description || details || '';

    if (!activeService) {
      return res.status(400).json({ error: 'Service category is required.' });
    }
    if (!address) {
      return res.status(400).json({ error: 'Address is required.' });
    }

    const booking = new Booking({
      customer: req.userId,
      service: activeService,             // Fixes "Path service is required"
      subService: subService || '',
      address,                            // Fixes "Path address is required"
      description: activeDescription,
      slot: slot || 'now',
      schedule,
      location: {
        type: 'Point',
        coordinates: [Number(lng), Number(lat)], // GeoJSON: Longitude FIRST
      },
      price: SERVICE_BASE_PRICE[service] || 15,
      status: 'pending',
    });

    await booking.save();

    // Start expanding ring dispatch algorithm
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

// GET /api/bookings/active — current user's active (non-terminal) booking
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

// GET /api/bookings/history — completed/cancelled bookings for current user
router.get('/history', async (req, res) => {
  try {
    const filter =
      req.userRole === 'customer'
        ? { customer: req.userId, status: { $in: ['completed', 'cancelled'] } }
        : { worker: req.userId, status: { $in: ['completed', 'cancelled'] } };

    const bookings = await Booking.find(filter)
      .populate('customer', 'name phone avatar')
      .populate('worker', 'name phone avatar')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ bookings });
  } catch (err) {
    console.error('[bookings/history]', err);
    res.status(500).json({ error: 'Failed to fetch booking history' });
  }
});

// GET /api/bookings/invites — open jobs available for a worker to accept
// GET /api/bookings/invites — Fetch pending jobs matching worker trade & location
router.get('/invites', async (req, res) => {
  try {
    const worker = await User.findById(req.userId);
    if (!worker || !worker.location?.coordinates) {
      return res.json([]);
    }

    const invites = await Booking.aggregate([
      {
        $geoNear: {
          near: worker.location,
          distanceField: "distanceMeters",
          spherical: true,
          query: {
            status: "pending",
            service: {
              $regex: `^${escapeRegex(worker.specialtyName)}$`,
              $options: "i",
            },
          },
        },
      },
      {
        $match: {
          $expr: { $lte: ["$distanceMeters", "$searchRadiusMeters"] },
        },
      },
    ]);

    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/bookings/:id/accept — worker accepts a pending job
router.patch('/:id/accept', async (req, res) => {
  try {
    if (req.userRole !== 'worker') {
      return res.status(403).json({ error: 'Only workers can accept jobs' });
    }

    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { worker: req.userId, status: 'assigned' },
      { new: true }
    )
      .populate('customer', 'name phone avatar rating')
      .populate('worker', 'name phone avatar rating specialty');

    if (!booking) {
      return res.status(409).json({ error: 'This job is no longer available' });
    }

    // Safely increment worker trips without NaN crashes
    const worker = await User.findById(req.userId);
    if (worker) {
      worker.trips = (worker.trips || 0) + 1;
      await worker.save();
    }

    const io = req.app.get('io');
    if (io) {
      const customerId = booking.customer?._id
        ? booking.customer._id.toString()
        : booking.customer.toString();

      // Tell the specific customer their booking was accepted
      io.to(`user:${customerId}`).emit('booking:updated', { booking });
      // Tell other workers this job is no longer available
      io.to('workers:online').emit('job:taken', { bookingId: booking._id });
    }

    res.json({ booking });
  } catch (err) {
    console.error('[bookings/accept]', err);
    res.status(500).json({ error: 'Failed to accept job' });
  }
});

// PATCH /api/bookings/:id/status — advance booking status (in_progress, completed, cancelled)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['in_progress', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const isParticipant =
      booking.customer.toString() === req.userId ||
      (booking.worker && booking.worker.toString() === req.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'You are not part of this booking' });
    }

    booking.status = status;
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

      // Broadcast to both customer and worker user rooms
      io.to(`user:${customerId}`).emit('booking:updated', { booking: populated });
      if (workerId) {
        io.to(`user:${workerId}`).emit('booking:updated', { booking: populated });
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