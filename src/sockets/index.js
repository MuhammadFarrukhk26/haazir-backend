const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Message = require('../models/Message');

function initSockets(io) {
  // Authenticate every socket connection using the same JWT issued by /api/auth
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('Missing auth token'));

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.userId;
      socket.userRole = payload.role;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', async (socket) => {
    const { userId, userRole } = socket;
    console.log(`[socket] connected user=${userId} role=${userRole} socket=${socket.id}`);

    // Every user gets a personal room so the server can target them directly
    // regardless of which device/app instance they're connected from.
    // socket.join(`user:${userId}`);
    socket.join(`user:${socket.userId}`);

    try {
      await User.findByIdAndUpdate(userId, { socketId: socket.id });
    } catch (err) {
      console.error('[socket] failed to store socketId', err);
    }

    // Workers explicitly toggle availability; only "online" workers receive job broadcasts.
    socket.on("worker:goOnline", async (coords) => {
      if (userRole !== "worker") return;
      socket.join("workers:online");
      console.log('[goOnline]', userId, coords);
      const update = { isOnline: true };
      if (typeof coords?.lat === "number" && typeof coords?.lng === "number") {
        update.location = {
          type: "Point",
          coordinates: [coords.lng, coords.lat],
        }; // longitude first
      }

      await User.findByIdAndUpdate(userId, update);
      socket.emit("worker:status", { isOnline: true });
    });

    socket.on('worker:goOffline', async () => {
      if (userRole !== 'worker') return;
      socket.leave('workers:online');
      await User.findByIdAndUpdate(userId, { isOnline: false });
      socket.emit('worker:status', { isOnline: false });
    });
    
    socket.on("worker:location", async ({ lat, lng }) => {
      if (userRole !== "worker") return;
      if (typeof lat !== "number" || typeof lng !== "number") return;
      await User.findByIdAndUpdate(userId, {
        location: { type: "Point", coordinates: [lng, lat] },
      });
    });

    // Real-time chat: persist then broadcast to both participants' personal rooms.
    socket.on('chat:send', async ({ bookingId, text }, ack) => {
      try {
        if (!bookingId || !text || !text.trim()) {
          return ack?.({ error: 'bookingId and text are required' });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) return ack?.({ error: 'Booking not found' });

        const isParticipant =
          booking.customer.toString() === userId ||
          (booking.worker && booking.worker.toString() === userId);
        if (!isParticipant) return ack?.({ error: 'Not part of this booking' });

        const message = await Message.create({
          booking: bookingId,
          sender: userId,
          senderRole: userRole,
          text: text.trim(),
        });

        const payload = {
          id: message._id,
          bookingId,
          sender: userId,
          senderRole: userRole,
          text: message.text,
          createdAt: message.createdAt,
        };

        // Deliver to both sides — whichever device/role they're using.
        io.to(`user:${booking.customer}`).emit('chat:message', payload);
        if (booking.worker) {
          io.to(`user:${booking.worker}`).emit('chat:message', payload);
        }

        ack?.({ message: payload });
      } catch (err) {
        console.error('[socket chat:send]', err);
        ack?.({ error: 'Failed to send message' });
      }
    });

    // Lightweight typing indicator, scoped to the booking's two participants.
    socket.on('chat:typing', async ({ bookingId, isTyping }) => {
      try {
        const booking = await Booking.findById(bookingId);
        if (!booking) return;
        const otherUserId =
          booking.customer.toString() === userId ? booking.worker : booking.customer;
        if (otherUserId) {
          io.to(`user:${otherUserId}`).emit('chat:typing', { bookingId, isTyping, fromRole: userRole });
        }
      } catch (err) {
        console.error('[socket chat:typing]', err);
      }
    });

    socket.on('disconnect', async () => {
      console.log(`[socket] disconnected user=${userId} socket=${socket.id}`);
      try {
        if (userRole === 'worker') {
          await User.findByIdAndUpdate(userId, { isOnline: false, socketId: null });
        } else {
          await User.findByIdAndUpdate(userId, { socketId: null });
        }
      } catch (err) {
        console.error('[socket] failed to clear socketId on disconnect', err);
      }
    });
  });
}

module.exports = initSockets;
