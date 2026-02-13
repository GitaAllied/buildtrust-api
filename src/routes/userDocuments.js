import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadDocumentSchema } from '../validation/schemas.js';
import { uploadDocument, listDocuments, deleteDocument, listAllDocuments, verifyDocument, approveDocument, declineDocument } from '../controllers/userDocumentsController.js';

const router = express.Router();

// Setup multer storage (save into subfolders per document type)
const ALLOWED_DOC_TYPES = ['license', 'certification', 'testimonial', 'identity'];
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      // Multer parses form fields before files, so req.body.type should be available
      const docType = req.body && req.body.type ? String(req.body.type) : null;
      if (!docType) return cb(new Error('Document type is required'));
      if (!ALLOWED_DOC_TYPES.includes(docType)) return cb(new Error('Invalid document type'));

      const dir = path.join(process.cwd(), 'uploads', docType);
      // Ensure directory exists
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random()*1e9)}-${file.originalname.replace(/\s+/g,'_')}`;
    cb(null, unique);
  }
});

// File validation: allow PDF, JPG, PNG; max size 10MB
const ALLOWED_MIMETYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      return cb(new Error('Invalid file type'));
    }
    cb(null, true);
  }
});

// Middleware to require document type in query or header BEFORE accepting file uploads
function requireDocType(req, res, next) {
  const docType = (req.query && req.query.type) || req.headers['x-document-type'];
  if (docType) {
    req.body = req.body || {};
    req.body.type = String(docType);
    return next();
  }

  // If no doc type provided in query/header: if multipart/form-data, drain the request
  // body first to avoid an early response closing the socket and causing the client to abort.
  const contentType = req.headers['content-type'] || '';
  if (contentType.startsWith('multipart/form-data')) {
    // Consume and discard the stream, then respond 400 after the upload finishes
    req.on('data', () => {});
    req.on('end', () => {
      // Ensure no file was written to disk in case multer started (unlikely since we didn't call next())
      return res.status(400).json({ error: 'Document type is required' });
    });
    // Also handle errors on the stream
    req.on('error', (err) => {
      return res.status(400).json({ error: 'Document type is required' });
    });
    // Do not call next(); we are handling the response after drain
    return;
  }

  // For non-multipart requests, reject immediately
  return res.status(400).json({ error: 'Document type is required' });
}

// POST /api/users/:id/documents - upload a document
// Note: we check for document type before running upload middleware so we can return a 400 quickly
router.post('/:id/documents', authenticateToken, requireDocType, upload.single('file'), validate(uploadDocumentSchema), uploadDocument);

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

export default router;