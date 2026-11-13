const express = require('express');
const mongoose = require('mongoose');
const ServiceCategory = require('../../models/ServiceCategory');
const { requireAdmin } = require('../../middleware/requireAdmin');

const router = express.Router();
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const KEY = /^[a-z0-9_-]+$/;

function cleanIssues(issues) {
  if (!Array.isArray(issues)) return null;
  return issues.map((i) => String(i).trim()).filter(Boolean);
}

// GET /api/admin/service-categories (includes inactive ones)
router.get('/', requireAdmin(), async (req, res) => {
  try {
    const data = await ServiceCategory.find().sort({ sortOrder: 1, name: 1 });
    res.json({ data });
  } catch (err) {
    console.error('[admin/service-categories list]', err);
    res.status(500).json({ error: 'Failed to load service categories' });
  }
});

// POST /api/admin/service-categories
router.post('/', requireAdmin('super_admin'), async (req, res) => {
  try {
    const { key, name, description, icon, color, secondaryColor, issues, basePrice, sortOrder } =
      req.body;

    if (!key || !KEY.test(String(key).trim().toLowerCase())) {
      return res.status(400).json({ error: 'key is required (letters, numbers, - or _)' });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (color !== undefined && !HEX.test(color)) {
      return res.status(400).json({ error: 'color must be a hex value like #FF3B30' });
    }
    if (secondaryColor !== undefined && !HEX.test(secondaryColor)) {
      return res.status(400).json({ error: 'secondaryColor must be a hex value' });
    }
    if (basePrice !== undefined && (!Number.isFinite(Number(basePrice)) || Number(basePrice) < 0)) {
      return res.status(400).json({ error: 'basePrice must be a number, 0 or more' });
    }

    const normalizedKey = String(key).trim().toLowerCase();
    if (await ServiceCategory.findOne({ key: normalizedKey })) {
      return res.status(409).json({ error: 'A category with this key already exists' });
    }

    const doc = await ServiceCategory.create({
      key: normalizedKey,
      name: String(name).trim(),
      description,
      icon,
      color,
      secondaryColor,
      issues: cleanIssues(issues) || [],
      basePrice: basePrice !== undefined ? Number(basePrice) : undefined,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
    });
    res.status(201).json(doc);
  } catch (err) {
    console.error('[admin/service-categories create]', err);
    res.status(500).json({ error: 'Failed to create service category' });
  }
});

// PATCH /api/admin/service-categories/:id
// The key can't be changed, because it's saved on every booking.
router.patch('/:id', requireAdmin('super_admin', 'finance', 'support'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const { name, description, icon, color, secondaryColor, issues, basePrice, sortOrder, isActive } =
      req.body;
    const update = {};

    if (basePrice !== undefined) {
      if (!['super_admin', 'finance'].includes(req.admin.role)) {
        return res.status(403).json({ error: 'Only super admin or finance can change prices' });
      }
      const price = Number(basePrice);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ error: 'basePrice must be a number, 0 or more' });
      }
      update.basePrice = price;
    }
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'name cannot be empty' });
      update.name = String(name).trim();
    }
    if (description !== undefined) update.description = String(description);
    if (icon !== undefined) update.icon = String(icon);
    if (color !== undefined) {
      if (!HEX.test(color)) return res.status(400).json({ error: 'color must be a hex value' });
      update.color = color;
    }
    if (secondaryColor !== undefined) {
      if (!HEX.test(secondaryColor)) {
        return res.status(400).json({ error: 'secondaryColor must be a hex value' });
      }
      update.secondaryColor = secondaryColor;
    }
    if (issues !== undefined) {
      const cleaned = cleanIssues(issues);
      if (!cleaned) return res.status(400).json({ error: 'issues must be an array of strings' });
      update.issues = cleaned;
    }
    if (sortOrder !== undefined) {
      if (!Number.isFinite(Number(sortOrder))) {
        return res.status(400).json({ error: 'sortOrder must be a number' });
      }
      update.sortOrder = Number(sortOrder);
    }
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive must be a boolean' });
      }
      update.isActive = isActive;
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const doc = await ServiceCategory.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Service category not found' });
    res.json(doc);
  } catch (err) {
    console.error('[admin/service-categories update]', err);
    res.status(500).json({ error: 'Failed to update service category' });
  }
});

module.exports = router;