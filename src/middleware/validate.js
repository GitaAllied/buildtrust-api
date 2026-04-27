import { ZodError } from 'zod';
import path from 'path';
import { resolveBackendPath } from '../utils/projectRoot.js';

export const validate = (schema) => {
  return async (req, res, next) => {
    try {
      // For multipart/form-data the body is already parsed by multer
      await schema.parseAsync(req.body);
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        // If multer already saved a file during multipart/form-data, remove the orphaned file
        if (req.file) {
          try {
            const fs = await import('fs');
            const path = await import('path');
            let filePath = null;
            if (req.file.path) {
              filePath = req.file.path;
            } else if (req.file.destination && req.file.filename) {
              filePath = path.join(req.file.destination, req.file.filename);
            } else if (req.file.filename) {
              filePath = path.join(resolveBackendPath('uploads'), req.file.filename);
            }
            if (filePath) fs.unlinkSync(filePath);
          } catch (e) {
            // ignore file deletion errors
          }
        }
        return res.status(400).json({ error: 'Validation error', details: err.errors });
      }
      return next(err);
    }
  };
};
