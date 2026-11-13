const express = require('express');
const Trade = require('../../models/Trade');
const { requireAdmin } = require('../../middleware/requireAdmin');

const router = express.Router();

// GET /api/admin/trades
router.get('/', requireAdmin(), async (req, res) => {
  try {
    const trades = await Trade.find().sort({ _id: 1 }); // not lean, so basePrice default applies
    res.json({ data: trades });
  } catch (err) {
    console.error('[admin/trades list]', err);
    res.status(500).json({ error: 'Failed to load trades' });
  }
});

// PATCH /api/admin/trades/:id   body: { basePrice?, isActive?, icon? }
router.patch('/:id', requireAdmin('super_admin', 'finance'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid trade id' });
    }

    const update = {};
    const { basePrice, isActive, icon } = req.body;

    if (basePrice !== undefined) {
      const price = Number(basePrice);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ error: 'basePrice must be a number, 0 or more' });
      }
      update.basePrice = price;
    }
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive must be a boolean' });
      }
      update.isActive = isActive;
    }
    if (icon !== undefined) update.icon = icon;

    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const trade = await Trade.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    res.json(trade);
  } catch (err) {
    console.error('[admin/trades update]', err);
    res.status(500).json({ error: 'Failed to update trade' });
  }
});

// POST /api/admin/trades   body: { name, basePrice?, icon? }
router.post('/', requireAdmin('super_admin'), async (req, res) => {
  try {
    const { name, basePrice, icon } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const exists = await Trade.findOne({
      name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });
    if (exists) return res.status(409).json({ error: 'A trade with this name already exists' });

    const last = await Trade.findOne().sort({ _id: -1 }).select('_id');
    const trade = await Trade.create({
      _id: (last?._id || 0) + 1,
      name: name.trim(),
      basePrice: basePrice !== undefined ? Number(basePrice) : undefined,
      icon: icon || null,
    });
    res.status(201).json(trade);
  } catch (err) {
    console.error('[admin/trades create]', err);
    res.status(500).json({ error: 'Failed to create trade' });
  }
});

module.exports = router;