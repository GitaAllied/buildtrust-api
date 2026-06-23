import express from 'express';
import * as authController from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { updateProfileSchema, changePasswordSchema } from '../validation/schemas.js';
import { authenticateToken } from '../middleware/auth.js';
import { getEmailDebugInfo } from '../services/email.js';

const router = express.Router();

// Auth routes mapped to controller methods
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/2fa/verify', authController.verifyTwoFactorCode);
router.post('/2fa/resend', authController.resendTwoFactorCode);
router.post('/2fa', authenticateToken, authController.setTwoFactorStatus);
router.post('/create-sub-admin', authController.createSubAdmin);
router.get('/me', authController.getMe);
// Validate profile updates
router.put('/me', validate(updateProfileSchema), authController.updateProfile);
router.post('/change-password', validate(changePasswordSchema), authController.changePassword);
router.post('/logout', authController.logout);
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Debug endpoint - email service status (for troubleshooting)
router.get('/debug/email-attempts', (req, res) => {
  const emailAttempts = getEmailDebugInfo();
  res.json({ 
    emailAttempts,
    totalCount: emailAttempts.length,
    timestamp: new Date().toISOString()
  });
});

export default router;
