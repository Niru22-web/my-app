import express from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { exportReport, options, overview, query, summary } from './reports.controller';

const router = express.Router();

router.use(authenticate);

router.get('/overview', overview);
router.get('/summary', summary);
router.get('/options', options);
router.post('/query', query);
router.get('/export', exportReport);

export default router;
