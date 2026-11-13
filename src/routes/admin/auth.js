const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../../models/Admin');

const router = express.Router();

function signAdminToken(admin) {
  return jwt.sign(
    { adminId: admin._id.toString(), role: admin.role },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '8h' }
  );
}

function sanitizeAdmin(admin) {
  return {
    id: admin._id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
  };
}

// POST /api/admin/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin || !admin.isActive) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    admin.lastLoginAt = new Date();
    await admin.save();

    const token = signAdminToken(admin);
    res.json({ token, admin: sanitizeAdmin(admin) });
  } catch (err) {
    console.error('[admin/auth/login]', err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

module.exports = router;