import { Router } from 'express';
import { getEvents, createEvent, deleteEvent } from './event.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getEvents);
router.post('/', createEvent);
router.delete('/:id', deleteEvent);

export default router;
