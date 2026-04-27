import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getUnreadMessageCount, getConversations, getMessagesForConversation, postMessage, markConversationRead, setTypingStatus, getTypingStatus, archiveConversation } from '../controllers/messagesController.js';

const router = express.Router();

// Protected endpoints - require authentication
router.get('/unread-count', authenticateToken, getUnreadMessageCount);
router.get('/conversations', authenticateToken, getConversations);
router.get('/:conversationId', authenticateToken, getMessagesForConversation);
router.post('/:conversationId/read', authenticateToken, markConversationRead);
router.patch('/:conversationId/archive', authenticateToken, archiveConversation);
router.post('/:conversationId/typing', authenticateToken, setTypingStatus);
router.get('/:conversationId/typing', authenticateToken, getTypingStatus);
router.post('/', authenticateToken, postMessage);

export default router;
