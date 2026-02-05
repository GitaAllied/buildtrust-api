import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getConversations, getMessagesForConversation, postMessage, markConversationRead, setTypingStatus, getTypingStatus } from '../controllers/messagesController.js';

const router = express.Router();

// Protected endpoints - require authentication
router.get('/conversations', authenticateToken, getConversations);
router.get('/:conversationId', authenticateToken, getMessagesForConversation);
router.post('/:conversationId/read', authenticateToken, markConversationRead);
router.post('/:conversationId/typing', authenticateToken, setTypingStatus);
router.get('/:conversationId/typing', authenticateToken, getTypingStatus);
router.post('/', authenticateToken, postMessage);

export default router;
