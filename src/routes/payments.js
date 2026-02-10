import express from 'express';
import { 
  getClientPaymentsSummary,
  getTransactionHistory,
  recordPayment,
  addPaymentMethod,
  listPaymentMethods,
  updatePaymentMethod,
  deletePaymentMethod
} from '../controllers/paymentsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get payment summary for authenticated user
router.get('/summary', authenticateToken, getClientPaymentsSummary);

// Get transaction history
router.get('/transactions', authenticateToken, getTransactionHistory);

// Record a new payment
router.post('/record', authenticateToken, recordPayment);

// Payment methods
router.get('/methods', authenticateToken, listPaymentMethods);
router.post('/methods', authenticateToken, addPaymentMethod);
router.put('/methods/:id', authenticateToken, updatePaymentMethod);
router.delete('/methods/:id', authenticateToken, deletePaymentMethod);

export default router;
