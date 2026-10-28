// sockets/locationHandlers.js
const User = require('../models/User');

function registerLocationHandlers(io, socket) {
  // Toggle worker online status + initial location
  socket.on('worker:goOnline', async (coords) => {
    const update = { isOnline: true };
    if (typeof coords?.lat === 'number' && typeof coords?.lng === 'number') {
      update.location = {
        type: 'Point',
        coordinates: [coords.lng, coords.lat], // Longitude first
      };
    }
    await User.findByIdAndUpdate(socket.userId, update);
  });

  socket.on('worker:goOffline', async () => {
    await User.findByIdAndUpdate(socket.userId, { isOnline: false });
  });

  // Track worker location while moving
  socket.on('worker:location', async (coords) => {
    if (typeof coords?.lat === 'number' && typeof coords?.lng === 'number') {
      await User.findByIdAndUpdate(socket.userId, {
        location: {
          type: 'Point',
          coordinates: [coords.lng, coords.lat],
        },
      });
    }
  });
}

module.exports = registerLocationHandlers;