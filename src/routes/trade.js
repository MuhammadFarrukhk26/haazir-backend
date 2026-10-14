const express = require('express');
const router = express.Router();
const Trade = require('../models/Trade');

const DEFAULT_TRADES = [
  { _id: 1, name: 'Electrician' },
  { _id: 2, name: 'Plumber' },
  { _id: 3, name: 'Carpenter' },
  { _id: 4, name: 'HVAC / AC Technician' },
  { _id: 5, name: 'Painter' },
];

// GET /api/trades - Fetch active trades for the worker registration dropdown
router.get('/', async (req, res) => {
  try {
    const trades = await Trade.find({ isActive: true }).select('_id name icon').sort({ _id: 1 });
    res.status(200).json({ success: true, data: trades });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, error: error.message });
  }
});

// POST /api/trades/seed - Insert/update core trades (run once, safe to re-run)
// Disabled in production. Uses upsert instead of deleteMany, so it never wipes the list
// that registered workers' specialty ids point to.
router.post('/seed', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, error: 'Seeding is disabled in production.' });
  }

  try {
    await Trade.bulkWrite(
      DEFAULT_TRADES.map((t) => ({
        updateOne: { filter: { _id: t._id }, update: { $set: t }, upsert: true },
      })),
    );

    const trades = await Trade.find().sort({ _id: 1 });
    res.status(201).json({ success: true, message: 'Trades seeded!', data: trades });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, error: error.message });
  }
});

module.exports = router;