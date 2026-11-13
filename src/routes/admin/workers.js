const express = require('express');
const mongoose = require('mongoose');
const User = require('../../models/User');
const { requireAdmin } = require('../../middleware/requireAdmin');

const router = express.Router();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/admin/workers?online=&verificationStatus=&specialty=&blocked=&search=&page=&limit=
router.get('/', requireAdmin(), async (req, res) => {
  try {
    const { online, verificationStatus, specialty, blocked, search } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

    const filter = { role: 'worker' };
    if (online !== undefined) filter.isOnline = online === 'true';
    if (blocked !== undefined) filter.isBlocked = blocked === 'true';
    if (verificationStatus) filter.verificationStatus = verificationStatus;
    if (specialty !== undefined && specialty !== '') filter.specialty = Number(specialty);
    if (search) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }

    const [data, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-passwordHash -socketId')
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[admin/workers list]', err);
    res.status(500).json({ error: 'Failed to load workers' });
  }
});

// PATCH /api/admin/workers/:id/verify   body: { status: 'approved' | 'rejected' }
router.patch('/:id/verify', requireAdmin('super_admin', 'support'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid worker id' });
    }
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }

    const worker = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'worker' },
      { $set: { verificationStatus: status } },
      { new: true }
    ).select('-passwordHash -socketId');

    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    res.json(worker);
  } catch (err) {
    console.error('[admin/workers verify]', err);
    res.status(500).json({ error: 'Failed to update verification' });
  }
});

// PATCH /api/admin/workers/:id/block   body: { blocked: true|false, reason? }
router.patch('/:id/block', requireAdmin('super_admin', 'support'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid worker id' });
    }
    const { blocked, reason } = req.body;
    if (typeof blocked !== 'boolean') {
      return res.status(400).json({ error: 'blocked (boolean) is required' });
    }
    if (blocked && (!reason || !reason.trim())) {
      return res.status(400).json({ error: 'reason is required when blocking' });
    }

    const update = blocked
      ? { isBlocked: true, blockedReason: reason.trim(), isOnline: false }
      : { isBlocked: false, blockedReason: '' };

    const worker = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'worker' },
      { $set: update },
      { new: true }
    ).select('-passwordHash -socketId');

    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    res.json(worker);
  } catch (err) {
    console.error('[admin/workers block]', err);
    res.status(500).json({ error: 'Failed to update worker' });
  }
});

module.exports = router;