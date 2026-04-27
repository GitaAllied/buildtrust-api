import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth.js';
import { resolveBackendPath } from '../utils/projectRoot.js';
import { validate } from '../middleware/validate.js';
import { uploadDocumentSchema } from '../validation/schemas.js';
import { uploadDocument, listDocuments, deleteDocument, listAllDocuments, verifyDocument, approveDocument, declineDocument } from '../controllers/userDocumentsController.js';

const router = express.Router();

// Setup multer storage (save to temp directory first, then move to final location)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = resolveBackendPath('uploads', 'temp');
    try {
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      cb(null, tempDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname.replace(/\s+/g,'_')}`);
  }
});

// File validation: allow all image types, PDF, DOC, DOCX; max size 10MB
const ALLOWED_MIMETYPES = [
  'application/pdf', 
  'image/jpeg', 
  'image/png', 
  'image/webp', 
  'image/gif', 
  'image/bmp', 
  'image/tiff',
  'application/msword', 
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {

    // For now, allow all files for testing
    console.log('📁 FILE FILTER CHECK:', { 
      fieldname: file.fieldname, 
      mimetype: file.mimetype, 
      originalname: file.originalname 
    });
    
    // Allow all files temporarily for debugging
    return cb(null, true);
    
    // Original logic (commented out for testing):
    // const isImage = file.mimetype.startsWith('image/');
    // const isAllowedSpecific = ALLOWED_MIMETYPES.includes(file.mimetype);
    // 
    // if (isImage || isAllowedSpecific) {
    //   return cb(null, true);
    // }
    // 
    // console.log('❌ FILE FILTER REJECTED:', { mimetype: file.mimetype, fieldname: file.fieldname });
    // return cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: Images, PDF, DOC, DOCX`));
  }
});

// Middleware to check for document type in query, header, or body (after multer)
function requireDocType(req, res, next) {
  const docType = (req.query && req.query.type) || req.headers['x-document-type'] || req.body.type;
  if (docType) {
    req.body = req.body || {};
    req.body.type = String(docType);
  }
  // Always continue, validation will happen later
  return next();
}

// POST /api/users/:id/documents - upload a document
// Note: we check for document type before running upload middleware so we can return a 400 quickly
router.post('/:id/documents', authenticateToken, upload.single('file'), requireDocType, validate(uploadDocumentSchema), uploadDocument);

// GET /api/users/:id/documents - list documents for a user (owner)
router.get('/:id/documents', authenticateToken, listDocuments);

// DELETE /api/users/:id/documents/:docId - delete a document (owner or admin)
router.delete('/:id/documents/:docId', authenticateToken, deleteDocument);

// Admin routes
// GET /api/users/admin/documents - list all documents (admin only)
router.get('/admin/documents', authenticateToken, listAllDocuments);
// PATCH /api/users/admin/documents/:docId - verify/unverify document (admin only)
router.patch('/admin/documents/:docId', authenticateToken, verifyDocument);

// POST /api/users/:id/documents/:docId/approve - approve document (admin only)
router.post('/:id/documents/:docId/approve', authenticateToken, approveDocument);

// POST /api/users/:id/documents/:docId/decline - decline document with reason (admin only)
router.post('/:id/documents/:docId/decline', authenticateToken, declineDocument);

// TEMP TEST ENDPOINT - upload file directly to Cloudinary for testing (admin only)
router.post('/admin/test-cloudinary-upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'File is required' });

    console.log('🧪 TEST CLOUDINARY UPLOAD:', {
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      destination: file.destination,
    });

    // Check if Cloudinary is configured
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(400).json({
        error: 'Cloudinary not configured',
        configured: false,
        hasCloudName: !!process.env.CLOUDINARY_CLOUD_NAME,
        hasApiKey: !!process.env.CLOUDINARY_API_KEY,
        hasApiSecret: !!process.env.CLOUDINARY_API_SECRET,
      });
    }

    // Upload to Cloudinary
    const cloudinaryModule = (await import('cloudinary')).default;
    const cloudinary = cloudinaryModule.v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const localFilePath = file.destination ? path.join(file.destination, file.filename) : resolveBackendPath('uploads', file.filename);

    console.log('🚀 UPLOADING TO CLOUDINARY FROM TEST ENDPOINT:', { localFilePath });

    const uploadResult = await cloudinary.uploader.upload(localFilePath, {
      folder: 'test',
      resource_type: 'auto',
      use_filename: true,
      unique_filename: false,
    });

    console.log('✅ TEST UPLOAD SUCCESS:', { publicId: uploadResult.public_id, url: uploadResult.secure_url });

    // Clean up local file
    try { if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath); } catch (e) { }

    res.json({
      success: true,
      message: 'File uploaded to Cloudinary successfully',
      cloudinaryUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      testThis: `Copy and open this URL in your browser to verify the image loads: ${uploadResult.secure_url}`,
    });
  } catch (error) {
    console.error('❌ TEST UPLOAD FAILED:', { error: error.message, code: error.code, status: error.http_code });
    res.status(500).json({
      error: 'Upload to Cloudinary failed',
      message: error.message,
      code: error.code,
      httpStatus: error.http_code,
    });
  }
});

export default router;