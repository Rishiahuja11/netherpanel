const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { initDatabase, getDb } = require('./database');

async function createApp() {
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

  const { securityHeaders } = require('./middleware/security');
  app.use(securityHeaders());

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

  app.use(express.static(path.join(__dirname, '..', 'public')));

  const authRoutes = require('./routes/auth');
  const serverRoutes = require('./routes/servers');
  const adminRoutes = require('./routes/admin');
  const clientRoutes = require('./routes/client');
  const meRoutes = require('./routes/me');
  const { apiRouter: publicApiRoutes, pageRouter: publicPageRoutes } = require('./routes/public');

  app.use('/api/auth', authRoutes);
  app.use('/api/servers', serverRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/client', clientRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/public', publicApiRoutes);
  app.use('/', publicPageRoutes);

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

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
  });

  const ServerService = require('./services/ServerService');
  ServerService.setIo(io);
  const NotificationService = require('./services/NotificationService');
  NotificationService.setIo(io);

  return { app, httpServer, io, db };
}

module.exports = { createApp };