const express = require('express');
const Booking = require('../../models/Booking');
const User = require('../../models/User');
const { requireAdmin } = require('../../middleware/requireAdmin');

const router = express.Router();
const STATUSES = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'unfulfilled'];
const TZ = 'Asia/Karachi';

// GET /api/admin/stats
router.get('/', requireAdmin(), async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const [
      statusAgg,
      bookingsToday,
      revenueAgg,
      last7Agg,
      byServiceAgg,
      totalWorkers,
      onlineWorkers,
      pendingVerification,
      totalCustomers,
    ] = await Promise.all([
      Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Booking.countDocuments({ createdAt: { $gte: startOfToday } }),
      Booking.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$price' } } },
      ]),
      Booking.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Booking.aggregate([
        { $group: { _id: '$service', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      User.countDocuments({ role: 'worker' }),
      User.countDocuments({ role: 'worker', isOnline: true }),
      User.countDocuments({ role: 'worker', verificationStatus: 'pending' }),
      User.countDocuments({ role: 'customer' }),
    ]);

    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    statusAgg.forEach((r) => {
      if (r._id in byStatus) byStatus[r._id] = r.count;
    });
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

    res.json({
      bookings: { total, today: bookingsToday, byStatus },
      workers: { total: totalWorkers, online: onlineWorkers, pendingVerification },
      customers: { total: totalCustomers },
      revenue: { completedTotal: revenueAgg[0]?.total || 0 },
      charts: {
        last7Days: last7Agg.map((r) => ({ date: r._id, count: r.count })),
        byService: byServiceAgg.map((r) => ({ service: r._id, count: r.count })),
      },
    });
  } catch (err) {
    console.error('[admin/stats]', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

module.exports = router;