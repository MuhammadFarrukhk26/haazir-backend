const express = require('express');
const router = express.Router();
const ServiceCategory = require('../models/ServiceCategory');

// GET /api/service-categories - categories + common issues for the customer Home screen
router.get('/', async (req, res) => {
  try {
    const categories = await ServiceCategory.find({ isActive: true })
      .select('key name description icon color secondaryColor issues')
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    console.error('[service-categories] list failed:', error);
    res.status(500).json({ success: false, error: 'Could not load services.' });
  }
});

// POST /api/service-categories/seed - insert/update the core categories (run once, safe to re-run)
// Disabled in production. Re-running resets these fields to the values below.
router.post('/seed', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, error: 'Seeding is disabled in production.' });
  }

  try {
    const defaults = [
      {
        key: 'electrician',
        name: 'Electrician',
        description: 'Fan repair, short circuits, UPS',
        icon: 'flash',
        color: '#FFCC00',
        secondaryColor: '#FFFCEB',
        issues: ['Ceiling Fan Repair', 'UPS Installation', 'Room Wiring Diagnostic', 'New Bracket Light Fix'],
      },
      {
        key: 'plumber',
        name: 'Plumber',
        description: 'Leaking pipes, washroom, pumps',
        icon: 'water',
        color: '#007AFF',
        secondaryColor: '#E6F2FF',
        issues: ['Water Pump Repair', 'Faucet Leaking', 'Drain Blockage Clear', 'Geyser Installation'],
      },
      {
        key: 'cctv',
        name: 'CCTV & Security',
        description: 'Camera installation, setup, DVR',
        icon: 'videocam',
        color: '#34C759',
        secondaryColor: '#EAF9EE',
        issues: ['Camera Connection Lost', 'DVR Hard Disk Error', 'New CCTV System Setup', 'Outdoor Security Light'],
      },
      {
        key: 'appliance',
        name: 'Appliance Repair',
        description: 'AC gas, washing machine, fridge',
        icon: 'construct',
        color: '#AF52DE',
        secondaryColor: '#F7EEFC',
        issues: ['AC Gas Refilling', 'Oven Heating Issue', 'Washing Machine Spin Fix', 'Refrigerator Defrost'],
      },
    ];

    await ServiceCategory.bulkWrite(
      defaults.map((c, index) => ({
        updateOne: {
          filter: { key: c.key },
          update: { $set: { ...c, sortOrder: index, isActive: true } },
          upsert: true,
        },
      })),
    );

    const categories = await ServiceCategory.find().sort({ sortOrder: 1 });
    res.status(201).json({ success: true, message: 'Service categories seeded!', data: categories });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;