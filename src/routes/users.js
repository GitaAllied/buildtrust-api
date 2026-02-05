import express from 'express';
import { getUsers, getUser, updateUser, deleteUser } from '../controllers/usersController.js';

const router = express.Router();

router.get('/users', getUsers);
router.get('/users/:userId', getUser);
router.put('/users/:userId', updateUser);
router.delete('/users/:userId', deleteUser);

export default router;
