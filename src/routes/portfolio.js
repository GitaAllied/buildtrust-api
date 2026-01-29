import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { completePortfolioSetup } from '../controllers/portfolioSetupController.js';

const router = express.Router();

// Ensure temp upload directory exists
const tempDir = path.join(process.cwd(), 'uploads', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter: (req, file, cb) => {
    // Allow images, PDFs, and documents
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: images, PDFs, Word, Excel'));
    }
  }
});

// POST /api/portfolio/setup - Complete portfolio setup with all data
// Accept any number of files with any field names
router.post('/setup', upload.any(), completePortfolioSetup);

export default router;
