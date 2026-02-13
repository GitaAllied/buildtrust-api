import fs from 'fs';
import path from 'path';
import pool from '../config/database.js';
import cloudinaryModule from 'cloudinary';

const cloudinary = cloudinaryModule.v2;

// Log Cloudinary configuration status
console.log('🔍 CLOUDINARY CONFIG CHECK:', {
  hasCloudName: !!process.env.CLOUDINARY_CLOUD_NAME,
  hasApiKey: !!process.env.CLOUDINARY_API_KEY,
  hasApiSecret: !!process.env.CLOUDINARY_API_SECRET,
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'NOT SET',
});

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('✅ CLOUDINARY INITIALIZED WITH CONFIG');
} else {
  console.warn('⚠️ CLOUDINARY CREDENTIALS NOT FULLY SET - will use local storage');
}

export const uploadDocument = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    // Ensure authenticated user is uploading their own documents
    if (!req.user || req.user.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const file = req.file;
    const { type } = req.body;

    const allowedTypes = ['license', 'certification', 'testimonial', 'identity'];

    if (!file) return res.status(400).json({ error: 'File is required' });
    if (!type) {
      // remove uploaded file if present
      try {
        const filePath = file && file.destination ? path.join(file.destination, file.filename) : path.join(process.cwd(), 'uploads', file.filename);
        fs.unlinkSync(filePath);
      } catch (e) {}
      return res.status(400).json({ error: 'Document type is required' });
    }
    if (!allowedTypes.includes(type)) {
      // remove uploaded file if present
      try {
        const filePath = file && file.destination ? path.join(file.destination, file.filename) : path.join(process.cwd(), 'uploads', file.filename);
        fs.unlinkSync(filePath);
      } catch (e) {}
      return res.status(400).json({ error: 'Invalid document type' });
    }

    const uploadsBase = process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/uploads` : `${req.protocol}://${req.get('host')}/uploads`;
    let url = `${uploadsBase}/${type}/${file.filename}`;

    // If Cloudinary is configured, upload the saved local file to Cloudinary and use its secure URL.
    const localFilePath = file && file.destination ? path.join(file.destination, file.filename) : path.join(process.cwd(), 'uploads', type, file.filename);
    
    console.log('📤 DOCUMENT UPLOAD INITIATED:', {
      userId,
      type,
      filename: file.filename,
      localFilePath,
      cloudinaryConfigured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
    });

    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      try {
        console.log('🚀 UPLOADING TO CLOUDINARY:', { folder: type, localFilePath });
        const uploadResult = await cloudinary.uploader.upload(localFilePath, { folder: type, resource_type: 'auto', use_filename: true, unique_filename: false });
        console.log('✅ CLOUDINARY UPLOAD SUCCESS:', { publicId: uploadResult.public_id, url: uploadResult.secure_url });
        if (uploadResult && uploadResult.secure_url) {
          url = uploadResult.secure_url;
        }
      } catch (e) {
        console.error('❌ CLOUDINARY UPLOAD FAILED:', { error: e.message, code: e.code, status: e.http_code });
      }

      // Remove local file after uploading to Cloudinary
      try { if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath); } catch (e) { console.warn('Failed to remove local file after Cloudinary upload:', e.message); }
    }

    const metadata = JSON.stringify({ originalName: file.originalname, mimeType: file.mimetype });
      // If there is an existing declined document (verified = 2) for this user and type,
      // replace it instead of inserting a new row. For identity uploads, the DB may
      // use multiple specific types (government_id, business_registration, selfie),
      // so treat 'identity' as a group when searching for existing declined docs.
      let existingRows;
      if (type === 'identity') {
        const identityTypes = ['government_id', 'business_registration', 'selfie'];
        const placeholders = identityTypes.map(() => '?').join(',');
        const sql = `SELECT id, filename, type FROM user_documents WHERE user_id = ? AND type IN (${placeholders}) AND verified = 2 LIMIT 1`;
        existingRows = await pool.query(sql, [userId, ...identityTypes]);
        // pool.query returns [rows, fields] so keep compatible below
        existingRows = existingRows[0];
      } else {
        const [rows] = await pool.query(
          'SELECT id, filename, type FROM user_documents WHERE user_id = ? AND type = ? AND verified = 2 LIMIT 1',
          [userId, type]
        );
        existingRows = rows;
      }

      if (Array.isArray(existingRows) && existingRows.length > 0) {
        const existing = existingRows[0];
        // remove old file from disk if present
        try {
          const oldPath = path.join(process.cwd(), 'uploads', existing.type || '', existing.filename);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch (e) {
          console.warn('Failed to remove old declined file from disk:', e.message);
        }

        // If the previous URL points to Cloudinary, attempt to remove the old resource there as well
        try {
          if (process.env.CLOUDINARY_CLOUD_NAME && existing.url && existing.url.includes('res.cloudinary.com')) {
            const parts = existing.url.split('/upload/');
            if (parts.length > 1) {
              // Remove file extension and any querystring
              const tail = parts[1].split('?')[0];
              const publicId = tail.replace(/\.[a-zA-Z0-9]+$/, '');
              await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
            }
          }
        } catch (e) {
          console.warn('Failed to remove old declined file:', e.message);
        }

        // update existing DB row to new file and mark unverified
        await pool.query(
          'UPDATE user_documents SET filename = ?, url = ?, size = ?, metadata = ?, verified = 0, decline_reason = NULL WHERE id = ?',
          [file.filename, url, file.size, metadata, existing.id]
        );

        // return updated document
        res.status(200).json({ id: existing.id, user_id: userId, type, filename: file.filename, url, size: file.size, metadata: JSON.parse(metadata), verified: 0, replaced: true });
        return;
      }

      const [result] = await pool.query(
        'INSERT INTO user_documents (user_id, type, filename, url, size, metadata, verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, type, file.filename, url, file.size, metadata, 0]
      );

      res.status(201).json({ id: result.insertId, user_id: userId, type, filename: file.filename, url, size: file.size, metadata: JSON.parse(metadata), verified: 0 });
  } catch (error) {

    res.status(500).json({ error: 'An error occurred while uploading document' });
  }
};

export const listDocuments = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    // Allow owners or admins/sub_admins to list
    if (!req.user || (req.user.userId !== userId && req.user.role !== 'admin' && req.user.role !== 'sub_admin')) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const [rows] = await pool.query('SELECT id, type, filename, url, size, metadata, verified, decline_reason, created_at FROM user_documents WHERE user_id = ?', [userId]);

    // Parse metadata JSON safely (it may already be an object depending on driver/config)
    const docs = rows.map(r => ({ ...r, metadata: r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : null }));

    res.json({ documents: docs });
  } catch (error) {

    res.status(500).json({ error: 'An error occurred while listing documents' });
  }
};

export const deleteDocument = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const docId = parseInt(req.params.docId, 10);

    // Allow owners or admins to delete
    if (!req.user || (req.user.userId !== userId && req.user.role !== 'admin')) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const [rows] = await pool.query('SELECT filename, user_id, type FROM user_documents WHERE id = ?', [docId]);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const filename = rows[0].filename;
    const ownerId = rows[0].user_id;
    const docType = rows[0].type;
    const filePath = path.join(process.cwd(), 'uploads', docType || '', filename);

    // Delete DB row
    await pool.query('DELETE FROM user_documents WHERE id = ?', [docId]);

    // Remove file from disk
    fs.unlink(filePath, (err) => {
      if (err) console.warn('Failed to delete file:', filePath, err.message);
    });

    res.json({ message: 'Document deleted' });
  } catch (error) {

    res.status(500).json({ error: 'An error occurred while deleting document' });
  }
};

export const listAllDocuments = async (req, res) => {
  try {
    // Only admins may access all documents
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const [rows] = await pool.query(`SELECT d.id, d.user_id, u.email as user_email, d.type, d.filename, d.url, d.size, d.metadata, d.verified, d.decline_reason, d.created_at
      FROM user_documents d
      JOIN users u ON u.id = d.user_id
      ORDER BY d.created_at DESC`);

    const docs = rows.map(r => ({ ...r, metadata: r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : null }));
    res.json({ documents: docs });
  } catch (error) {
    console.error('List all documents error:', error);
    res.status(500).json({ error: 'An error occurred while listing documents' });
  }
};

export const verifyDocument = async (req, res) => {
  try {
    // Only admins can verify
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const docId = parseInt(req.params.docId, 10);
    const { verified } = req.body;

    if (typeof verified !== 'boolean') return res.status(400).json({ error: 'verified must be boolean' });

    await pool.query('UPDATE user_documents SET verified = ? WHERE id = ?', [verified ? 1 : 0, docId]);

    const [rows] = await pool.query('SELECT id, user_id, type, filename, url, size, metadata, verified, created_at FROM user_documents WHERE id = ?', [docId]);
    if (!Array.isArray(rows) || rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    const row = rows[0];
    row.metadata = row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null;

    res.json({ document: row });
  } catch (error) {
    console.error('Verify document error:', error);
    res.status(500).json({ error: 'An error occurred while verifying document' });
  }
};

export const approveDocument = async (req, res) => {
  try {
    // Only admins can approve documents
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'sub_admin')) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const userId = parseInt(req.params.id, 10);
    const docId = parseInt(req.params.docId, 10);

    // Verify document belongs to the user
    const [rows] = await pool.query('SELECT id, user_id, verified, created_at FROM user_documents WHERE id = ? AND user_id = ?', [docId, userId]);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Update document to verified
    await pool.query('UPDATE user_documents SET verified = 1, decline_reason = NULL WHERE id = ?', [docId]);

    // Update user documents_verified flag when required document types are approved.
    // Required set: an identity doc (government_id OR business_registration OR selfie),
    // at least one license, and at least one certification. When all present and verified,
    // mark the user as documents_verified.
    try {
      const [identityCountRows] = await pool.query(
        'SELECT COUNT(*) as count FROM user_documents WHERE user_id = ? AND type IN ("government_id","business_registration","selfie") AND verified = 1',
        [userId]
      );

      const [licenseCountRows] = await pool.query(
        'SELECT COUNT(*) as count FROM user_documents WHERE user_id = ? AND type = "license" AND verified = 1',
        [userId]
      );

      const [certCountRows] = await pool.query(
        'SELECT COUNT(*) as count FROM user_documents WHERE user_id = ? AND type = "certification" AND verified = 1',
        [userId]
      );

      const identityVerified = identityCountRows[0] && identityCountRows[0].count > 0;
      const licenseVerified = licenseCountRows[0] && licenseCountRows[0].count > 0;
      const certificationVerified = certCountRows[0] && certCountRows[0].count > 0;

      if (identityVerified && licenseVerified && certificationVerified) {
        await pool.query('UPDATE users SET documents_verified = 1 WHERE id = ? AND role = "developer"', [userId]);
      }
    } catch (e) {
      console.error('Failed to update documents_verified flag:', e);
    }

    const [updatedDoc] = await pool.query('SELECT id, user_id, type, filename, url, size, verified, created_at, decline_reason FROM user_documents WHERE id = ?', [docId]);
    
    res.json({ 
      message: 'Document approved successfully',
      document: updatedDoc[0]
    });
  } catch (error) {
    console.error('Approve document error:', error);
    res.status(500).json({ error: 'An error occurred while approving document' });
  }
};

export const declineDocument = async (req, res) => {
  try {
    // Only admins can decline documents
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'sub_admin')) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const userId = parseInt(req.params.id, 10);
    const docId = parseInt(req.params.docId, 10);
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      return res.status(400).json({ error: 'Decline reason is required' });
    }

    // Verify document belongs to the user
    const [rows] = await pool.query('SELECT id, user_id FROM user_documents WHERE id = ? AND user_id = ?', [docId, userId]);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Update document with decline reason and mark as declined (verified = 2)
    await pool.query('UPDATE user_documents SET verified = 2, decline_reason = ? WHERE id = ?', [reason.trim(), docId]);

    // Mark user documents as not verified
    await pool.query('UPDATE users SET documents_verified = 0 WHERE id = ?', [userId]);

    const [updatedDoc] = await pool.query('SELECT id, user_id, type, filename, url, size, verified, created_at, decline_reason FROM user_documents WHERE id = ?', [docId]);
    
    res.json({ 
      message: 'Document declined and user notified',
      document: updatedDoc[0]
    });
  } catch (error) {
    console.error('Decline document error:', error);
    res.status(500).json({ error: 'An error occurred while declining document' });
  }
};