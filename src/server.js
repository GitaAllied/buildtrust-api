import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
// Load .env first, then override with .env.local if it exists
dotenv.config(); // Load default .env
dotenv.config({ path: '.env.local', override: true }); // Override with .env.local
import authRoutes from './routes/auth.js';
import userDocumentsRoutes from './routes/userDocuments.js';
import projectsRoutes from './routes/projects.js';
import portfolioRoutes from './routes/portfolio.js';
import developersRoutes from './routes/developers.js';
import messagesRoutes from './routes/messages.js';
import usersRoutes from './routes/users.js';
import reportsRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';
import supportRoutes from './routes/support.js';
import paymentsRoutes from './routes/payments.js';
import notificationsRoutes from './routes/notifications.js';
import { initializeDatabase } from './config/dbInit.js';
import { resolveBackendPath } from './utils/projectRoot.js';
import { auditSubmission } from './middleware/audit.js';
import { deleteOldNotifications } from './controllers/notificationsController.js';
import { expireProjectAcceptances } from './controllers/projectsController.js';


const app = express();
const PORT = process.env.PORT || 3001;

// Graceful shutdown management
let server = null;
let isShuttingDown = false;

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3001',
  'http://localhost:8080',
  'https://buildtrust.vercel.app',
  'https://buildtrust-one.vercel.app',
  // other allowed origins...
];

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads directory exists and serve it statically
const uploadsDir = resolveBackendPath('uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  try {
    if (server && server.listening) {
      server.close(() => {
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  } catch (error) {
    process.exit(0);
  }

  // Force exit after 5 seconds if still running
  setTimeout(() => {
    process.exit(0);
  }, 5000);
}

// Initialize database (async, don't wait) with better error handling
initializeDatabase().catch(error => {
  // Silent - continue startup regardless
});

// Global error handlers
process.on('uncaughtException', (err) => {
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  process.exit(1);
});

// Setup signal handlers for DirectAdmin compatibility
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

// Audit submissions (non-GET requests)
app.use(auditSubmission);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', usersRoutes);
app.use('/api/users', userDocumentsRoutes);
app.use('/api/users', notificationsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/developers', developersRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/payments', paymentsRoutes);

// Multer / Upload error handler
app.use((err, req, res, next) => {
  if (err) {
    // Multer file size error
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Max size is 10 MB' });
    }

    // Invalid file type from fileFilter
    if (err.message === 'Invalid file type') {
      return res.status(400).json({ error: 'Invalid file type. Allowed: PDF, JPG, PNG' });
    }

    // Document type validation errors from storage.destination
    if (err.message === 'Document type is required' || err.message === 'Invalid document type') {
      return res.status(400).json({ error: err.message });
    }

    // Generic Multer errors
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    }

    // Fallback: unhandled errors -> 500
    return res.status(500).json({ error: 'Internal server error' });
  }
  next(err);
});

// Health check - moved to top for priority
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'BuildTrust API is running',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found', 
    message: `Route ${req.method} ${req.path} does not exist`,
    path: req.path,
    method: req.method
  });
});

// Global error handler (must be last)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({ 
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server only when not running tests
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`[Server] ✓ BuildTrust API running on port ${PORT}`);
    console.log(`[Server] ✓ Health check: http://localhost:${PORT}/api/health`);
    console.log(`[Server] ✓ Node version: ${process.version}`);

    // Run project acceptance expiry check immediately on startup
    (async () => {
      try {
        console.log('[Startup] Running initial project acceptance expiry check...');
        await expireProjectAcceptances();
      } catch (error) {
        console.error('[Startup] Error during initial project acceptance expiry check:', error);
      }
    })();

    // Schedule automatic cleanup of old notifications every hour
    const cleanupInterval = setInterval(async () => {
      try {
        await deleteOldNotifications();
      } catch (error) {
        console.error('[Cleanup] Error during scheduled notification cleanup:', error);
      }
    }, 60 * 60 * 1000); // Run every hour (3600000 ms)

    // Schedule automatic expiration of pending project acceptances every 30 minutes
    const projectExpiryInterval = setInterval(async () => {
      try {
        await expireProjectAcceptances();
      } catch (error) {
        console.error('[Cleanup] Error during project acceptance expiry check:', error);
      }
    }, 30 * 60 * 1000); // Run every 30 minutes (1800000 ms)

    // Store interval IDs for potential cleanup on graceful shutdown
    server.cleanupInterval = cleanupInterval;
    server.projectExpiryInterval = projectExpiryInterval;
    console.log('[Server] ✓ Scheduled notification cleanup: every 1 hour');
    console.log('[Server] ✓ Scheduled project acceptance expiry: every 30 minutes (+ on startup)');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      process.exit(1);
    } else {
      process.exit(1);
    }
  });

  // Handle server close
  server.on('close', () => {
    // Clear scheduled cleanup on server close
    if (server.cleanupInterval) {
      clearInterval(server.cleanupInterval);
    }
    if (server.projectExpiryInterval) {
      clearInterval(server.projectExpiryInterval);
    }
  });
}

export default app;
