const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["customer", "worker"], required: true },
    specialty: { type: Number, ref: "Trade", default: null },
    specialtyName: { type: String, default: null },
    rating: { type: Number, default: 5.0 },
    trips: { type: Number, default: 0 },
    avatar: { type: String, default: null },
    isOnline: { type: Boolean, default: false },
    socketId: { type: String, default: null },
    services: [{ type: String }],
    location: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number], default: undefined },
    },
    // admin-managed
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    isBlocked: { type: Boolean, default: false },
    blockedReason: { type: String, default: "" },
  },
  { timestamps: true },
);
userSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("User", userSchema);
