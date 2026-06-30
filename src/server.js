require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const initSockets = require('./sockets');

const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const messageRoutes = require('./routes/messages');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' }, // tighten this to your app's actual origin(s) before production
});

app.set('io', io);

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/messages', messageRoutes);

initSockets(io);

const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[server] Haazir backend listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[server] Failed to connect to MongoDB, exiting.', err);
    process.exit(1);
  });
