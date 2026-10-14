// One-time: fills `specialtyName` for workers who registered before it existed.
//   node src/seed/backfillSpecialtyName.js
require('dotenv').config();
const mongoose = require('mongoose');
const Trade = require('../models/Trade');
const User = require('../models/User');

(async () => {
  try {
    // Use the same env var your config/db.js reads
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

    const trades = await Trade.find().lean();
    const nameById = Object.fromEntries(trades.map((t) => [String(t._id), t.name]));

    const workers = await User.find({ role: 'worker', specialty: { $exists: true, $ne: null } });
    let updated = 0;

    for (const worker of workers) {
      const name = nameById[String(worker.specialty)];
      if (name && worker.specialtyName !== name) {
        worker.specialtyName = name;
        await worker.save();
        updated += 1;
      }
    }

    console.log(`Updated ${updated} of ${workers.length} workers`);
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();