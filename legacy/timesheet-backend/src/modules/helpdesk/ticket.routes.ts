import { Router } from "express";
import { createTicket, getAllTickets, updateTicketStatus, addTicketHistory, getTicketById, deleteTicket } from "./ticket.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { authorizeRoles } from "../../middleware/role.middleware";
import multer from "multer";
import * as path from "path";
import * as fs from "fs";
import { getUploadsDir } from "../../utils/assetUrl";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ticketsDir = path.join(getUploadsDir(), 'tickets');
    if (!fs.existsSync(ticketsDir)) {
      fs.mkdirSync(ticketsDir, { recursive: true });
    }
    cb(null, ticketsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitizedName);
  }
});

const blockedTicketExtensions = new Set([
  '.html', '.htm', '.svg', '.js', '.mjs', '.exe', '.bat', '.cmd', '.ps1', '.sh'
]);

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit to support photos & large videos
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (blockedTicketExtensions.has(ext)) {
      return cb(new Error(`File extension ${ext} is not allowed for security reasons.`));
    }
    cb(null, true);
  }
});

const router = Router();

router.post("/", authenticate, upload.array("attachments", 10), createTicket);
router.get("/", authenticate, getAllTickets); // Controller now handles role-based filtering
router.get("/:id", authenticate, getTicketById); // Get single ticket with history
router.patch("/:id", authenticate, updateTicketStatus);
router.delete("/:id", authenticate, deleteTicket);
router.post("/:id/history", authenticate, upload.array("attachments", 10), addTicketHistory); // Add comment/status history entry

export default router;

