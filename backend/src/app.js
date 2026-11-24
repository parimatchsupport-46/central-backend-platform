const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { globalLimiter } = require('./middleware/rateLimiter');
const authRoutes = require('./modules/auth/auth.routes');
const projectRoutes = require('./modules/projects/projects.routes');
const { publicDataRouter, adminDataRouter } = require('./modules/database/data.routes');
const { publicStorageRouter, adminStorageRouter } = require('./modules/storage/storage.routes');
const backupRoutes = require('./modules/backups/backups.routes');
const logRoutes = require('./modules/logs/logs.routes');

const app = express();

// Security & Core Middleware
app.use(helmet());
app.use(globalLimiter);
app.use('/api/v1', cors()); app.use('/api/admin', cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'central-backend-platform',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Admin Auth & Management Routes
app.use('/api/admin/auth', authRoutes);
app.use('/api/admin/projects', projectRoutes);
app.use('/api/admin/database', adminDataRouter);
app.use('/api/admin/storage', adminStorageRouter);
app.use('/api/admin/backups', backupRoutes);
app.use('/api/admin/logs', logRoutes);

// Public Isolated Project Routes
app.use('/api/v1/data', publicDataRouter);
app.use('/api/v1/storage', publicStorageRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

module.exports = app;
