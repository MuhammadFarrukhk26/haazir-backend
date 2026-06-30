const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['customer', 'worker'], default: 'customer' },
    specialty: { type: String, default: null }, // worker-only
    rating: { type: Number, default: 5.0 },
    trips: { type: Number, default: 0 },
    avatar: { type: String, default: null },
    isOnline: { type: Boolean, default: false }, // worker availability toggle
    socketId: { type: String, default: null }, // current active socket connection, if any
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
