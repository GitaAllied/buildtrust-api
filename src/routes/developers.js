import express from 'express';
import { getDevelopers, getDeveloperById, saveDeveloper, unsaveDeveloper, checkIfDeveloperSaved, getSavedDevelopers } from '../controllers/developersController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { developerIdSchema } from '../validation/schemas.js';

const router = express.Router();

// GET /api/developers - Get all developers
router.get('/', getDevelopers);

// POST /api/developers/save - Save a developer
router.post('/save', authenticateToken, validate(developerIdSchema), saveDeveloper);

// POST /api/developers/unsave - Unsave a developer
router.post('/unsave', authenticateToken, validate(developerIdSchema), unsaveDeveloper);

// GET /api/developers/saved - Get all saved developers for logged-in user
router.get('/saved', authenticateToken, getSavedDevelopers);

// GET /api/developers/:id - Get single developer by ID
router.get('/:id', getDeveloperById);

// GET /api/developers/:id/is-saved - Check if developer is saved
router.get('/:id/is-saved', authenticateToken, checkIfDeveloperSaved);

export default router;
