const express = require('express');
const mongoose = require('mongoose');
const Booking = require('../../models/Booking');
const { requireAdmin } = require('../../middleware/requireAdmin');

const router = express.Router();

// GET /api/admin/bookings?status=&service=&from=&to=&page=1&limit=20
router.get('/', requireAdmin(), async (req, res) => {
  try {
    const { status, service, from, to } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

    const filter = {};
    if (status) filter.status = status;
    if (service) filter.service = service;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const [data, total] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('customer', 'name phone')
        .populate('worker', 'name phone specialtyName')
        .select('-notifiedWorkers')
        .lean(),
      Booking.countDocuments(filter),
    ]);

    res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[admin/bookings list]', err);
    res.status(500).json({ error: 'Failed to load bookings' });
  }
});

// GET /api/admin/bookings/:id
router.get('/:id', requireAdmin(), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid booking id' });
    }
    const booking = await Booking.findById(req.params.id)
      .populate('customer', 'name phone email rating')
      .populate('worker', 'name phone email rating specialtyName')
      .lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    booking.notifiedWorkersCount = booking.notifiedWorkers?.length || 0;
    delete booking.notifiedWorkers;
    res.json(booking);
  } catch (err) {
    console.error('[admin/bookings detail]', err);
    res.status(500).json({ error: 'Failed to load booking' });
  }
});

// PATCH /api/admin/bookings/:id/cancel   body: { reason }
router.patch('/:id/cancel', requireAdmin('super_admin', 'support'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid booking id' });
    }
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (!['pending', 'assigned', 'in_progress'].includes(booking.status)) {
      return res.status(409).json({ error: `Cannot cancel a ${booking.status} booking` });
    }

    booking.status = 'cancelled';
    booking.cancelledBy = 'admin';
    booking.cancelReason = reason.trim();
    booking.cancelledAt = new Date();
    await booking.save();

    res.json({ message: 'Booking cancelled', id: booking._id, status: booking.status });
  } catch (err) {
    console.error('[admin/bookings cancel]', err);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

module.exports = router;