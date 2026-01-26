import express from 'express';
import { completePortfolioSetup } from '../controllers/portfolioSetupController.js';

const router = express.Router();

// POST /api/portfolio/setup - Complete portfolio setup with all data
router.post('/setup', completePortfolioSetup);

export default router;
