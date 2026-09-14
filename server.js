const path = require('path');
const fs = require('fs');

const ENV_PATH = path.join(__dirname, '.env');
if (fs.existsSync(ENV_PATH)) {
  fs.readFileSync(ENV_PATH, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  });
}

const PORT = parseInt(process.env.PORT || process.env.PANEL_PORT || '3000', 10);
const HOST = process.env.HOST || process.env.PANEL_HOST || '0.0.0.0';

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'servers'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'tmp', 'uploads'), { recursive: true });

async function startServer() {
  const { app, httpServer, io, db } = await require('./src/app').createApp();

  const ServerService = require('./src/services/ServerService');
  const NotificationService = require('./src/services/NotificationService');
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
        if (socket.userId && socket.userId !== decoded.id) {
          socket.rooms.forEach((room) => {
            if (room.startsWith('console:')) socket.leave(room);
          });
        }
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

      if (socket.userRole !== 'admin' && !ServerService.canAccess(serverId, socket.userId, ['console'])) {
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

      if (!command || typeof command !== 'string') {
        return socket.emit('error', { error: 'Invalid command' });
      }

      const server = ServerService.getServer(serverId);
      if (!server) {
        return socket.emit('error', { error: 'Server not found' });
      }

      if (socket.userRole !== 'admin' && !ServerService.canAccess(serverId, socket.userId, ['console'])) {
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

      if (socket.userRole !== 'admin' && !ServerService.canAccess(serverId, socket.userId, ['power'])) {
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

      if (socket.userRole !== 'admin' && !ServerService.canAccess(serverId, socket.userId, ['power'])) {
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

      if (socket.userRole !== 'admin' && !ServerService.canAccess(serverId, socket.userId, ['power'])) {
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

  db.prepare("UPDATE servers SET status = 'stopped', pid = NULL WHERE status = 'running'").run();

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

  httpServer.listen(PORT, HOST, () => {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║           NetherPanel v4.0.0             ║
  ║      Minecraft Server Panel (Termux)     ║
  ║                                          ║
  ║  Server running on port ${PORT}             ║
  ║  API: http://localhost:${PORT}/api          ║
  ║                                          ║
  ║  Default login:                          ║
  ║  Username: admin                         ║
  ║  Password: admin123 (change on sign-in)  ║
  ╚══════════════════════════════════════════╝
    `);

    const bcrypt = require('bcryptjs');

    const existingAdmin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
    if (!existingAdmin) {
      bcrypt.hash('admin123', 12).then(hashedPassword => {
        db.prepare(
          "INSERT INTO users (username, email, password, role, must_change_password) VALUES ('admin', 'admin@netherpanel.local', ?, 'admin', 1)"
        ).run(hashedPassword);
        console.log('Default admin user created (admin/admin123). A password change will be required on first sign-in.');
      });
    }
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
