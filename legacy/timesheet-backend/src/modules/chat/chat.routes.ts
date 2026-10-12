import { Router } from 'express';
import { getTeamMessages, createTeamMessage } from './chat.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, getTeamMessages);
router.post('/', authenticate, createTeamMessage);

export default router;
