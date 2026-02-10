import express from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { getUsers, getUser, updateUser, deleteUser, updateProfileImage } from '../controllers/usersController.js';

const router = express.Router();

router.get('/users', getUsers);
router.get('/users/:userId', getUser);
router.put('/users/:userId', updateUser);
router.delete('/users/:userId', deleteUser);

// Multer storage for profile images
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		const uploadDir = path.join(process.cwd(), 'uploads', 'profile_images');
		if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
		cb(null, uploadDir);
	},
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname) || '';
		const userId = req.params.userId || 'anon';
		cb(null, `${userId}-${Date.now()}${ext}`);
	}
});

const upload = multer({
	storage,
	limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
	fileFilter: (_req, file, cb) => {
		const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
		const ext = path.extname(file.originalname).toLowerCase();
		if (!allowed.includes(ext)) return cb(new Error('Invalid file type'));
		cb(null, true);
	}
});

// Upload profile image
router.put('/users/:userId/avatar', upload.single('avatar'), updateProfileImage);

export default router;
