import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getReportTypes,
  generateFinancialReport,
  generateUserReport,
  generateProjectReport,
  getRecentReports,
  downloadReport,
} from '../controllers/reportsController.js';

const router = express.Router();

// Protected endpoints - require authentication and admin role
router.get('/types', authenticateToken, getReportTypes);
router.get('/recent', authenticateToken, getRecentReports);
router.post('/financial', authenticateToken, generateFinancialReport);
router.post('/user', authenticateToken, generateUserReport);
router.post('/project', authenticateToken, generateProjectReport);
router.get('/download/:reportId/:type', authenticateToken, downloadReport);

export default router;
