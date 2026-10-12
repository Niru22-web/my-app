import { Router } from "express";
import {
  listMaster,
  getMasterOptions,
  createMaster,
  updateMaster,
  deleteMaster,
  toggleMasterStatus
} from "./masters.controller";

const router = Router();

// Middleware to authenticate any user
const authenticate = (req: any, res: any, next: any) => {
  let token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token." });
  }
};

// Middleware to check if user is admin/it
const checkAdminRole = (req: any, res: any, next: any) => {
  let token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
    const userRole = (decoded.role as string).toLowerCase();
    if (['admin', 'it'].includes(userRole)) {
      req.user = decoded;
      next();
    } else {
      res.status(403).json({ error: "Access denied. Action restricted to Admins/IT." });
    }
  } catch (error) {
    res.status(401).json({ error: "Invalid token." });
  }
};

// Routes mapping
router.get("/:type/options", authenticate, getMasterOptions);
router.get("/:type", authenticate, listMaster);
router.post("/:type", authenticate, checkAdminRole, createMaster);
router.put("/:type/:id", authenticate, checkAdminRole, updateMaster);
router.delete("/:type/:id", authenticate, checkAdminRole, deleteMaster);
router.patch("/:type/:id/toggle-status", authenticate, checkAdminRole, toggleMasterStatus);

export default router;
