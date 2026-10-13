import { Router } from 'express';
import { checkIn, checkOut, getTodaySummary, getHistory, getWeeklySummary, getAllAttendance, attendanceLogin, getAttendanceReport, getMonthlyTrends, forceCheckout, updateAttendance, getWeeklyPulseComparison } from './attendance.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// Existing routes
router.post('/check-in', authenticate, checkIn);
router.post('/login', authenticate, attendanceLogin);
router.post('/check-out', authenticate, checkOut);
router.post('/logout', authenticate, checkOut);
router.get('/my-attendance', authenticate, getTodaySummary);
router.get('/today', authenticate, getTodaySummary);
router.get('/weekly', authenticate, getWeeklySummary);
router.get('/weekly-pulse', authenticate, getWeeklyPulseComparison);
router.get('/history', authenticate, getHistory);
router.get('/logs', authenticate, getHistory);
router.get('/all', authenticate, getAllAttendance);
router.get('/', authenticate, getAllAttendance);

// New routes for enhanced functionality
router.get('/report', authenticate, getAttendanceReport);
router.get('/monthly', authenticate, getMonthlyTrends);
router.post('/force-checkout', authenticate, forceCheckout);
router.put('/update', authenticate, updateAttendance);

export default router;
