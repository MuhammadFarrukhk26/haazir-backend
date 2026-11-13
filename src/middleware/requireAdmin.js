const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

exports.requireAdmin = (...allowedRoles) => async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    const admin = await Admin.findById(payload.adminId);
    if (!admin || !admin.isActive) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (allowedRoles.length && !allowedRoles.includes(admin.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    req.admin = admin;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};