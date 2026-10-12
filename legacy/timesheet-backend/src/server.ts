import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import http from 'http';
import fs from "fs";

// Load environment variables in order of precedence
const env = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${env}`);
const defaultEnvPath = path.resolve(process.cwd(), '.env');

dotenv.config({ path: envPath });
dotenv.config({ path: defaultEnvPath });

console.log(`🔧 Environment: ${env}`);

// Routes
import authRoutes from "./modules/auth/auth.routes";
import employeeRoutes from "./modules/employee/employee.routes";
import clientRoutes from "./modules/client/client.routes";
import projectRoutes from "./modules/project/project.routes";
import jobRoutes from "./modules/job/job.routes";
import timelogRoutes from "./modules/timelog/timelog.routes";
import timelogWeeklyRoutes from "./modules/timelog/timelog-weekly.routes";
import leaveRoutes from "./modules/leave/leave.routes";
import emailRoutes from "./modules/email/email.routes";
import emailConnectorRoutes from "./modules/email/email-connector.routes";
import emailOAuthRoutes from "./routes/emailOAuthRoutes";
import userPermissionsRoutes from "./modules/userPermissions/userPermissions.routes";
import notificationRoutes from "./modules/notification/notification.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import activityRoutes from "./modules/activity/activity.routes";
import reimbursementRoutes from "./modules/reimbursement/reimbursement.routes";
import reportRoutes from "./modules/reports/reports.routes";
import attendanceRoutes from "./modules/attendance/attendance.routes";
import ticketRoutes from "./modules/helpdesk/ticket.routes";
import helpdeskRoutes from "./modules/helpdesk/helpdesk.routes";
import assetRoutes from "./modules/asset/asset.routes";
import eventRoutes from "./modules/event/event.routes";
import assetRequestRoutes from "./modules/asset-request/asset-request.routes";
import searchRoutes from "./modules/search/search.routes";
import accountsRoutes from "./modules/accounts/accounts.routes";
import mastersRoutes from "./modules/masters/masters.routes";
import complianceRoutes from "./modules/compliance/compliance.routes";
import esslRoutes from "./modules/essl/essl.routes";
import chatRoutes from "./modules/chat/chat.routes";
import systemRoutes from "./modules/system/system.routes";


import { validateRegistrationToken } from "./modules/employee/registrationToken.controller";
import { authenticate } from "./middleware/auth.middleware";
import { initSocket } from './services/socket.service';
import { startCronJobs } from './services/cron.service';
import { prisma } from "./config/prisma";
import compression from 'compression';

const app = express();
app.use(compression());


const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
    "https://timesheet.asaind.co.in",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174"
  ];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked for origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.options("*", cors());


import { getUploadsDir } from "./utils/assetUrl";

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
// --- NEW: Handle uploaded documents if any ---
// This is already handled by individual controllers but we ensure the folder exists here
const uploadDir = path.join(getUploadsDir(), "profile");
if (!fs.existsSync(uploadDir)) {
  console.log('📁 Creating profile uploads directory...');
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use('/uploads', express.static(getUploadsDir(), {
  maxAge: '7d',
  etag: true,
  index: false
}));
console.log(`📁 Static uploads served from: ${getUploadsDir()}`);

// Request logging middleware
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "development") {
    console.log(`=== API HIT === ${req.method} ${req.originalUrl}`);
    if (req.body && Object.keys(req.body).length > 0) {
      // Don't log sensitive data like passwords if possible
      const logBody = { ...req.body };
      if (logBody.password) logBody.password = '********';
      if (logBody.newPassword) logBody.newPassword = '********';
      if (logBody.currentPassword) logBody.currentPassword = '********';
      console.log("Request Body:", logBody);
    }
  }

  if ((req as any).user) {
    console.log("Authenticated User:", (req as any).user?.id);
  }
  next();
});

// No longer needed here as it's standardized above

// API Router for consolidated routing
const apiRouter = express.Router();

// Health Check with Database Status
apiRouter.get("/health", async (req, res) => {
  let dbStatus = "Unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "Connected";
  } catch (e) {
    dbStatus = "Disconnected";
    console.error("❌ Health check DB error:", e);
  }

  res.json({
    status: "OK",
    uptime: process.uptime(),
    database: dbStatus,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

apiRouter.get("/ping", (req, res) => {
  res.json({ success: true, message: "pong", timestamp: new Date().toISOString() });
});

// Mount Modules on apiRouter (without the /api prefix)
apiRouter.use("/auth", authRoutes);
apiRouter.use("/employees", employeeRoutes);
apiRouter.use("/email/oauth", emailOAuthRoutes);
apiRouter.use("/email", emailRoutes);
apiRouter.use("/email", emailConnectorRoutes);
apiRouter.use("/clients", clientRoutes);
apiRouter.use("/projects", projectRoutes);
apiRouter.use("/jobs", jobRoutes);
apiRouter.use("/tasks", jobRoutes);
apiRouter.use("/timelogs", timelogRoutes);
apiRouter.use("/timesheets", timelogRoutes);
apiRouter.use("/leaves", leaveRoutes);
apiRouter.use("/admin", userPermissionsRoutes);
apiRouter.use("/notifications", notificationRoutes);
apiRouter.use("/activity", activityRoutes);
apiRouter.use("/dashboard", dashboardRoutes);
apiRouter.use("/reimbursements", reimbursementRoutes);
apiRouter.use("/reports", reportRoutes);
apiRouter.use("/attendance", attendanceRoutes);
apiRouter.use("/assets", assetRoutes);
apiRouter.use("/events", eventRoutes);
apiRouter.use("/asset-requests", assetRequestRoutes);
apiRouter.use("/search", searchRoutes);
apiRouter.use("/accounts", accountsRoutes);
apiRouter.use("/tickets", ticketRoutes);
apiRouter.use("/masters", mastersRoutes);
apiRouter.use("/compliance", complianceRoutes);
apiRouter.use("/essl", esslRoutes);
apiRouter.use("/chat", chatRoutes);
apiRouter.use("/ticket", ticketRoutes);
apiRouter.use("/helpdesk", helpdeskRoutes);
apiRouter.use("/system", systemRoutes);

apiRouter.get("/registration/validate", validateRegistrationToken);

// Mount the apiRouter on /api
app.use("/api", apiRouter);

// Health Check at root (keep for backward compatibility)
app.get("/health", (req, res) => {
  res.json({ status: "OK", root: true });
});

// Catch-all route for any unmatched /api routes
app.all("/api/*", (req, res) => {
  const fullUrl = `${req.method} ${req.originalUrl}`;
  console.log(`❌ UNMATCHED API ROUTE: ${fullUrl}`);

  res.status(404).json({
    success: false,
    message: `API Route not found: ${fullUrl}`,
    path: req.path,
    baseUrl: req.baseUrl,
    originalUrl: req.originalUrl,
    availableBaseRoutes: [
      "/api/auth", "/api/employees", "/api/clients", "/api/projects",
      "/api/jobs", "/api/timelogs", "/api/leaves", "/api/notifications",
      "/api/attendance", "/api/hierarchy"
    ]
  });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('🔥 GLOBAL API ERROR:', err);

  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  const errorCode = err.code || err.errorCode || "SERVER_ERROR";

  res.status(status).json({
    success: false,
    message: message,
    errorCode: errorCode,
    data: null,
    // Include stack trace only in development
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

const PORT = parseInt(process.env.PORT || "5000");

async function healAssetStatuses() {
  try {
    console.log("🔍 Checking for mismatch in asset allocation statuses...");
    // Find all active allocations
    const activeAllocations = await prisma.assetAllocation.findMany({
      where: {
        status: 'Allocated'
      },
      include: {
        inventory: true
      }
    });

    console.log(`🔍 Found ${activeAllocations.length} active allocations in database.`);

    let healedCount = 0;
    for (const alloc of activeAllocations) {
      if (alloc.inventory && alloc.inventory.status === 'Available') {
        console.log(`⚠️ Mismatch found: Asset "${alloc.inventory.assetName}" (ID: ${alloc.inventory.assetId}) is allocated but marked as 'Available'. Healing to 'Allocated'...`);
        await prisma.assetInventory.update({
          where: { id: alloc.inventoryId },
          data: { status: 'Allocated' }
        });
        healedCount++;
      }
    }

    if (healedCount > 0) {
      console.log(`✅ Auto-healed ${healedCount} incorrectly marked 'Available' assets to 'Allocated'!`);
    } else {
      console.log("✅ No asset status mismatches found.");
    }
  } catch (err) {
    console.error("❌ Failed to run asset auto-healing:", err);
  }
}

function startServer(port: number) {
  const httpServer = http.createServer(app);
  initSocket(httpServer);
  const server = httpServer.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📡 Binding set to 0.0.0.0 for external access`);
    console.log(`🌐 API Base URL: https://timesheet.asaind.co.in/api`);
    startCronJobs();
    healAssetStatuses();
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`⚠️ Port ${port} is in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      process.exit(1);
    }
  });
  return server;
}

const server = startServer(PORT);

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));

export default app;
