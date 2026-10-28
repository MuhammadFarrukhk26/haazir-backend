// services/dispatch.js
const User = require("../models/User");
const Booking = require("../models/Booking");

const RINGS = [3000, 6000, 10000, 15000]; // 3km, 6km, 10km, 15km
const WAIT_MS = 15000; // 45 seconds per ring
const ANSWER_MS = 10000; // 60 seconds for the customer to answer "still looking?"
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function runRing(io, bookingId, step = 0) {
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.status !== "pending") return; // Stop if accepted or cancelled

  booking.searchRadiusMeters = RINGS[step];

  // Match online workers within radius AND matching trade
  const workers = await User.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: booking.location.coordinates },
        distanceField: "distanceMeters",
        maxDistance: RINGS[step],
        spherical: true,
        query: {
          role: "worker",
          isOnline: true,
          specialtyName: {
            $regex: `^${escapeRegex(booking.service)}$`,
            $options: "i",
          },
        },
      },
    },
    { $project: { _id: 1, distanceMeters: 1 } },
  ]);

  console.log("ring", step, "matched", workers.length);

  // Exclude workers already notified in earlier rings
  const fresh = workers.filter(
    (w) => !booking.notifiedWorkers.some((id) => id.equals(w._id)),
  );

  // Emit to fresh workers over Socket.io
  fresh.forEach((w) => {
    io.to(`user:${w._id}`).emit("job:new", {
      booking: { ...booking.toObject(), distanceMeters: w.distanceMeters },
    });
  });

  booking.notifiedWorkers.push(...fresh.map((w) => w._id));
  await booking.save();

  // Trigger next ring if no one accepted
  if (step + 1 < RINGS.length) {
    setTimeout(
      () => runRing(io, bookingId, step + 1).catch(console.error),
      WAIT_MS,
    );
  } else {
    // Last ring done: after it expires, ask the customer if they want to keep searching
    setTimeout(async () => {
      try {
        const latest = await Booking.findById(bookingId);
        if (!latest || latest.status !== "pending") return;

        const round = latest.searchRound; // remember which round we asked in

        io.to(`user:${latest.customer}`).emit("booking:stillLooking", {
          bookingId: latest._id,
          message:
            "No specialist has accepted yet. Do you want to keep searching?",
        });

        // No answer in 60s -> give up (only if the round hasn't changed)
        setTimeout(async () => {
          try {
            const check = await Booking.findById(bookingId);
            if (
              check &&
              check.status === "pending" &&
              check.searchRound === round
            ) {
              check.status = "unfulfilled";
              await check.save();
              io.to(`user:${check.customer}`).emit("booking:unfulfilled", {
                bookingId: check._id,
                message: "No available specialists nearby at this time.",
              });
            }
          } catch (e) {
            console.error("[dispatch give-up]", e);
          }
        }, ANSWER_MS);
      } catch (e) {
        console.error("[dispatch still-looking]", e);
      }
    }, WAIT_MS);
  }
}

// Customer tapped "Yes, keep searching"
async function continueSearch(io, bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.status !== "pending") return false;

  booking.searchRound += 1; // tells the old 60s timer "the customer answered"
  booking.notifiedWorkers = []; // let everyone in range get pinged again
  await booking.save();

  runRing(io, bookingId, RINGS.length - 1).catch(console.error);
  return true;
}

module.exports = { runRing, continueSearch };