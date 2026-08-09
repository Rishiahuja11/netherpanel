const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { initDatabase, getDb } = require('./src/database');

const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(process.env.HOME || '/data/data/com.termux/files/home/panel', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'servers'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true });

async function startServer() {
  await initDatabase();
  const db = getDb();

  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  const authRoutes = require('./src/routes/auth');
  const serverRoutes = require('./src/routes/servers');
  const adminRoutes = require('./src/routes/admin');
  const clientRoutes = require('./src/routes/client');

  app.use('/api/auth', authRoutes);
  app.use('/api/servers', serverRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/client', clientRoutes);

  app.get('/api', (req, res) => {
    res.json({
      name: 'NetherPanel API',
      version: '1.0.0',
      endpoints: {
        auth: '/api/auth',
        servers: '/api/servers',
        admin: '/api/admin',
        client: '/api/client'
      }
    });
  });

  const ServerService = require('./src/services/ServerService');
  const ScheduleService = require('./src/services/ScheduleService');
  const CrashService = require('./src/services/CrashService');
  const UserService = require('./src/services/UserService');

  const userSockets = new Map();

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('auth', (token) => {
      try {
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('./src/middleware/auth');
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.userId = decoded.id;
        socket.userRole = decoded.role;

        if (!userSockets.has(decoded.id)) {
          userSockets.set(decoded.id, new Set());
        }
        userSockets.get(decoded.id).add(socket.id);

        socket.emit('authenticated', { userId: decoded.id });
      } catch (err) {
        socket.emit('auth_error', { error: 'Invalid token' });
      }
    });

    socket.on('subscribe_console', (serverId) => {
      const server = ServerService.getServer(serverId);
      if (!server) {
        return socket.emit('error', { error: 'Server not found' });
      }

      if (server.user_id !== socket.userId && socket.userRole !== 'admin') {
        return socket.emit('error', { error: 'Access denied' });
      }

      socket.join(`console:${serverId}`);
      socket.emit('console_subscribed', { serverId });

      const history = ServerService.getConsole(serverId);
      if (history.length > 0) {
        socket.emit('console_history', { serverId, lines: history });
      }
    });

    socket.on('unsubscribe_console', (serverId) => {
      socket.leave(`console:${serverId}`);
      socket.emit('console_unsubscribed', { serverId });
    });

    socket.on('send_command', ({ serverId, command }) => {
      if (!socket.userId) {
        return socket.emit('error', { error: 'Not authenticated' });
      }

      const server = ServerService.getServer(serverId);
      if (!server) {
        return socket.emit('error', { error: 'Server not found' });
      }

      if (server.user_id !== socket.userId && socket.userRole !== 'admin') {
        return socket.emit('error', { error: 'Access denied' });
      }

      try {
        ServerService.sendCommand(serverId, command, socket.userId);
        socket.emit('command_sent', { serverId, command });
      } catch (err) {
        socket.emit('error', { error: err.message });
      }
    });

    socket.on('start_server', async (serverId) => {
      if (!socket.userId) {
        return socket.emit('error', { error: 'Not authenticated' });
      }

      const server = ServerService.getServer(serverId);
      if (!server) {
        return socket.emit('error', { error: 'Server not found' });
      }

      if (server.user_id !== socket.userId && socket.userRole !== 'admin') {
        return socket.emit('error', { error: 'Access denied' });
      }

      try {
        await ServerService.startServer(serverId, socket.userId);
        socket.emit('server_started', { serverId });
      } catch (err) {
        socket.emit('error', { error: err.message });
      }
    });

    socket.on('stop_server', async (serverId) => {
      if (!socket.userId) {
        return socket.emit('error', { error: 'Not authenticated' });
      }

      const server = ServerService.getServer(serverId);
      if (!server) {
        return socket.emit('error', { error: 'Server not found' });
      }

      if (server.user_id !== socket.userId && socket.userRole !== 'admin') {
        return socket.emit('error', { error: 'Access denied' });
      }

      try {
        await ServerService.stopServer(serverId, socket.userId);
        socket.emit('server_stopped', { serverId });
      } catch (err) {
        socket.emit('error', { error: err.message });
      }
    });

    socket.on('restart_server', async (serverId) => {
      if (!socket.userId) {
        return socket.emit('error', { error: 'Not authenticated' });
      }

      const server = ServerService.getServer(serverId);
      if (!server) {
        return socket.emit('error', { error: 'Server not found' });
      }

      if (server.user_id !== socket.userId && socket.userRole !== 'admin') {
        return socket.emit('error', { error: 'Access denied' });
      }

      try {
        await ServerService.restartServer(serverId, socket.userId);
        socket.emit('server_restarted', { serverId });
      } catch (err) {
        socket.emit('error', { error: err.message });
      }
    });

    socket.on('server_status', (serverId) => {
      const server = ServerService.getServer(serverId);
      if (!server) {
        return socket.emit('error', { error: 'Server not found' });
      }

      socket.emit('status_update', {
        serverId,
        status: server.status,
        is_running: ServerService.isRunning(serverId)
      });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);

      if (socket.userId && userSockets.has(socket.userId)) {
        userSockets.get(socket.userId).delete(socket.id);
        if (userSockets.get(socket.userId).size === 0) {
          userSockets.delete(socket.userId);
        }
      }
    });
  });

  ScheduleService.init();

  const activeServers = db.prepare("SELECT id FROM servers WHERE status = 'running'").all();
  for (const srv of activeServers) {
    CrashService.monitorServer(srv.id);
  }

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
  });

  httpServer.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║           NetherPanel v1.0.0             ║
  ║      Minecraft Server Panel              ║
  ║                                          ║
  ║  Server running on port ${PORT}             ║
  ║  API: http://localhost:${PORT}/api          ║
  ║                                          ║
  ║  Default login:                          ║
  ║  Username: admin                         ║
  ║  Password: admin123                      ║
  ╚══════════════════════════════════════════╝
    `);

    const bcrypt = require('bcryptjs');

    const existingAdmin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
    if (!existingAdmin) {
      bcrypt.hash('admin123', 12).then(hashedPassword => {
        db.prepare(
          "INSERT INTO users (username, email, password, role) VALUES ('admin', 'admin@netherpanel.local', ?, 'admin')"
        ).run(hashedPassword);
        console.log('Default admin user created (admin/admin123)');
      });
    }
  });

  module.exports = { app, server: httpServer, io };
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
