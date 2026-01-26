import express from 'express';
import { getDevelopers, getDeveloperById } from '../controllers/developersController.js';

const router = express.Router();

// GET /api/developers - Get all developers
router.get('/', getDevelopers);

// GET /api/developers/:id - Get single developer by ID
router.get('/:id', getDeveloperById);

export default router;
