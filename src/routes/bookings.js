const express = require('express');
const Booking = require('../models/Booking');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const SERVICE_BASE_PRICE = {
  electrician: 15,
  plumber: 18,
  cctv: 25,
  appliance: 20,
};

// POST /api/bookings  — customer creates a new booking request
router.post('/', async (req, res) => {
  try {
    const { service, subService, description, address, location, slot } = req.body;
    if (!service || !address) {
      return res.status(400).json({ error: 'service and address are required' });
    }

    const booking = await Booking.create({
      customer: req.userId,
      service,
      subService,
      description,
      address,
      location,
      slot,
      price: SERVICE_BASE_PRICE[service] || 15,
      status: 'pending',
    });

    const populated = await booking.populate('customer', 'name phone avatar rating');

    // Notify every online worker in real time about the new job
    const io = req.app.get('io');
    io.to('workers:online').emit('job:new', { booking: populated });

    res.status(201).json({ booking: populated });
  } catch (err) {
    console.error('[bookings/create]', err);
    res.status(500).json({ error: 'Failed to create booking' });
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
router.get('/invites', async (req, res) => {
  try {
    if (req.userRole !== 'worker') {
      return res.status(403).json({ error: 'Only workers can view job invites' });
    }
    const bookings = await Booking.find({ status: 'pending' })
      .populate('customer', 'name phone avatar rating')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ bookings });
  } catch (err) {
    console.error('[bookings/invites]', err);
    res.status(500).json({ error: 'Failed to fetch job invites' });
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

    const worker = await User.findById(req.userId);
    worker.trips += 1;
    await worker.save();

    const io = req.app.get('io');
    // Tell the specific customer their booking was accepted
    io.to(`user:${booking.customer._id}`).emit('booking:updated', { booking });
    // Tell other workers this job is no longer available
    io.to('workers:online').emit('job:taken', { bookingId: booking._id });

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
    io.to(`user:${booking.customer}`).emit('booking:updated', { booking: populated });
    if (booking.worker) {
      io.to(`user:${booking.worker}`).emit('booking:updated', { booking: populated });
    }

    res.json({ booking: populated });
  } catch (err) {
    console.error('[bookings/status]', err);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
});

module.exports = router;
