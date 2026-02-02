import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
import authRoutes from './routes/auth.js';
import userDocumentsRoutes from './routes/userDocuments.js';
import projectsRoutes from './routes/projects.js';
import portfolioRoutes from './routes/portfolio.js';
import developersRoutes from './routes/developers.js';
import { initializeDatabase } from './config/dbInit.js';
// migrations removed: dbInit handles required schema changes
import fs from 'fs';
import path from 'path';


const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3002',
  'http://localhost:3001',
  'http://localhost:8080',
  'https://buildtrust.vercel.app',
  'https://buildtrust-one.vercel.app',
  // other allowed origins...
];

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads directory exists and serve it statically
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Initialize database
initializeDatabase().catch(console.error);

// Migrations disabled - `initializeDatabase` performs schema setup

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

import { auditSubmission } from './middleware/audit.js';
// Audit submissions (non-GET requests)
app.use(auditSubmission);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userDocumentsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/developers', developersRoutes);

import multer from 'multer';

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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'BuildTrust API is running' });
});

// Start server only when not running tests
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
  });
}

export default app;
