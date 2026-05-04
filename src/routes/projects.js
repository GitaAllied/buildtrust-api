import express from 'express';
import { 
  createProject, 
  uploadProjectMedia, 
  getProjects,
  getProjectById,
  getAllProjects,
  updateProject, 
  deleteProject,
  submitProjectRequest,
  assignDeveloperToProject,
  adminUpdateProject,
  adminDeleteProject,
  getDeveloperProjects,
  getDeveloperActiveProjects,
  acceptProjectAssignment,
  rejectProjectAssignment,
  signContract,
  getProjectMedia,
  getProjectContract,
  updateProjectContract,
  deleteProjectContract,
  checkExpiredProjectAcceptances,
  getContractTemplate,
  updateContractTemplate,
  getAllContracts,
  getContractById
} from '../controllers/projectsController.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const router = express.Router();

// Configure multer for file uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../../uploads');

// Multer storage for general media uploads (existing images/videos for projects)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = req.params.projectId;
    const projectDir = path.join(uploadsDir, 'projects', projectId);
    
    // Create project-specific directory if it doesn't exist
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    
    cb(null, projectDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'video/mp4',
      'video/webm',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, videos, and supported documents are allowed.'));
    }
  }
});

const signatureStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = req.params.projectId;
    const contractDir = path.join(uploadsDir, 'contracts', projectId);
    if (!fs.existsSync(contractDir)) {
      fs.mkdirSync(contractDir, { recursive: true });
    }
    cb(null, contractDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const extension = path.extname(file.originalname) || '.png';
    const safeRole = (req.body.role || 'signature').replace(/[^a-zA-Z0-9-_]/g, '');
    cb(null, `${timestamp}-${safeRole}-signature${extension}`);
  }
});

const uploadSignature = multer({
  storage: signatureStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for signatures
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG/PNG/GIF signatures are allowed.'));
    }
  }
});

// Multer storage for project request uploads (PDFs, docs, images, etc.)
const requestStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Files will be moved to project-specific folder after project is created
    // For now, use temp folder
    const tempDir = path.join(uploadsDir, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadRequest = multer({
  storage: requestStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for requests
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, PNG, DOC, and DOCX are allowed.'));
    }
  }
});

// Routes - specific routes first
router.get('/admin/all', getAllProjects);
router.get('/admin/contracts', getAllContracts);
router.get('/admin/contracts/:contractId', getContractById);
router.get('/developer/assigned', getDeveloperProjects);
router.get('/developer/active', getDeveloperActiveProjects);
router.get('/contract-template', getContractTemplate);
router.post('/request/submit', uploadRequest.single('sitePlan'), submitProjectRequest);
router.post('/:projectId/accept', acceptProjectAssignment);
router.post('/:projectId/reject', rejectProjectAssignment);
router.get('/:projectId', getProjectById);
router.get('/:projectId/media', getProjectMedia);
router.get('/:projectId/contract', getProjectContract);
router.put('/:projectId/contract', updateProjectContract);
router.delete('/:projectId/contract', deleteProjectContract);
router.get('/', getProjects);
router.post('/', createProject);
router.put('/:projectId', updateProject);
router.delete('/:projectId', deleteProject);
router.post('/:projectId/media', upload.single('file'), uploadProjectMedia);
router.post('/:projectId/sign', uploadSignature.single('signature'), signContract);

// Admin routes
router.post('/admin/:projectId/assign-developer', assignDeveloperToProject);
router.post('/admin/check-expired-acceptances', checkExpiredProjectAcceptances);
router.put('/admin/:projectId/status', adminUpdateProject);
router.put('/admin/contract-template', updateContractTemplate);
router.delete('/admin/:projectId', adminDeleteProject);

// DEBUG: Check database state
router.get('/admin/debug/all-projects', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });

    const [projects] = await pool.query(
      `SELECT id, title, developer_id, acceptance_status, assigned_at 
       FROM projects 
       LIMIT 20`
    );

    res.json({
      debug: true,
      message: 'Raw database projects',
      total: projects.length,
      projects: projects
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
