require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const email = 'admin@haazir.com';
    const passwordHash = await bcrypt.hash('Abc123',10);

    await Admin.findOneAndUpdate(
      { email },
      {
        $set: {
          name: 'Super Admin',
          passwordHash,
          role: 'super_admin',
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );

    console.log('Super admin created/updated:', email);
  } catch (err) {
    console.error('Seed failed:', err);
  } finally {
    await mongoose.disconnect();
  }
})();