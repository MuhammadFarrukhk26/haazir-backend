const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Trade = require('../models/Trade');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function sanitizeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    specialty: user.specialty,         // trade id (e.g. 2)
    specialtyName: user.specialtyName, // trade name (e.g. "Plumber"), use this for display
    rating: user.rating,
    trips: user.trips,
    avatar: user.avatar,
    isOnline: user.isOnline,
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, role, specialty } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'name, email, phone, and password are required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Workers must pick a real trade. We save both its id and its name,
    // so the app can show "Plumber" instead of "2".
    const isWorker = role === 'worker';
    let trade = null;
    if (isWorker) {
      const tradeId = Number(specialty);
      trade = Number.isInteger(tradeId)
        ? await Trade.findOne({ _id: tradeId, isActive: true })
        : null;
      if (!trade) {
        return res.status(400).json({ error: 'Please choose a valid trade' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      passwordHash,
      role: isWorker ? 'worker' : 'customer',
      specialty: trade ? trade._id : null,
      specialtyName: trade ? trade.name : null,
    });

    const token = signToken(user);
    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

module.exports = router;