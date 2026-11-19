import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { env } from "./config/env";
import { prisma, stripPassword } from "./config/db";
import { initSocketServer } from "./plugins/socket";
import { authRoutes } from "./modules/auth.routes";
import { dashboardRoutes } from "./modules/dashboard.routes";
import { employeeRoutes } from "./modules/employees.routes";
import { managementRoutes } from "./modules/management.routes";
import { timelogRoutes } from "./modules/timelogs.routes";
import { complianceRoutes } from "./modules/compliance.routes";
import { attendanceRoutes } from "./modules/attendance.routes";
import { attendanceRequestRoutes } from "./modules/attendance-requests.routes";
import { leaveRoutes } from "./modules/leaves.routes";
import { reimbursementRoutes } from "./modules/reimbursements.routes";
import { assetRoutes } from "./modules/assets.routes";
import { helpdeskRoutes } from "./modules/helpdesk.routes";
import { accountsRoutes } from "./modules/accounts.routes";
import { payrollEngineRoutes } from "./modules/payroll-engine.routes";
import { misRoutes } from "./modules/mis.routes";
import { accountsBillingRoutes } from "./modules/accounts-billing.routes";
import { importRoutes } from "./modules/imports.routes";
import { insightsRoutes } from "./modules/insights.routes";
import { bugRoutes } from "./modules/bugs.routes";
import { announcementRoutes } from "./modules/announcements.routes";
import { releaseRoutes } from "./modules/releases.routes";
import { adminRoutes } from "./modules/admin.routes";
import { systemRoutes } from "./modules/system.routes";
import { reportRoutes } from "./modules/reports.routes";
import { leavePolicyRoutes } from "./modules/leave-policy.routes";

export async function buildServer() {
  const app = Fastify({
    logger: env.NODE_ENV === "development",
    // JSON bodies stay small; file uploads have their own per-file limit below.
    bodyLimit: 2 * 1024 * 1024,
    // Behind a proxy (Next.js in dev, Nginx, or a cloud load balancer) req.ip is the real client address.
    // Configured by TRUST_PROXY (default 127.0.0.1); see config/env.ts.
    trustProxy: env.TRUST_PROXY,
  });

  await app.register(cors, {
    origin: env.FRONTEND_ORIGINS,
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 10,
    },
  });

  // Basic security headers on every response.
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
    if (env.NODE_ENV === "production") reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    return payload;
  });

  // One place that turns failures into safe, useful answers: database internals, file paths and
  // stack traces are logged on the server but never sent to the browser.
  app.setErrorHandler((err: Error & { code?: string; statusCode?: number; validation?: unknown }, req, reply) => {
    const prismaCode = typeof err.code === "string" && /^P\d{4}$/.test(err.code) ? err.code : null;
    if (prismaCode === "P2025") return reply.code(404).send({ success: false, message: "That record no longer exists." });
    if (prismaCode === "P2002") return reply.code(409).send({ success: false, message: "A record with these details already exists." });
    if (prismaCode === "P2003") return reply.code(400).send({ success: false, message: "This refers to something that doesn’t exist or is still in use." });
    if (err.name === "PrismaClientValidationError" || prismaCode === "P2000" || prismaCode === "P2006" || prismaCode === "P2007") {
      return reply.code(400).send({ success: false, message: "Some of the details sent aren’t valid. Check dates and numbers and try again." });
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      // Fastify's own client errors (bad JSON, body too large, unsupported media type…)
      const message = err.statusCode === 413 ? "That upload is too large." : err.statusCode === 415 ? "Unsupported request format." : "The request couldn’t be read.";
      return reply.code(err.statusCode).send({ success: false, message });
    }
    req.log.error(err);
    if (env.NODE_ENV !== "development") console.error(`[${new Date().toISOString()}] ${req.method} ${req.url}`, err);
    return reply.code(500).send({ success: false, message: "Something went wrong on our side. Please try again." });
  });

  // Global preSerialization hook: guarantee password hashes are never sent in any JSON response (S4, A3, P2, T9, H4, AS2, AC2)
  app.addHook("preSerialization", async (_req, _reply, payload) => {
    if (payload && typeof payload === "object") {
      return stripPassword(payload as Record<string, any>);
    }
    return payload;
  });

  await app.register(systemRoutes);
  await app.register(authRoutes);
  await app.register(dashboardRoutes);
  await app.register(employeeRoutes);
  await app.register(managementRoutes);
  await app.register(timelogRoutes);
  await app.register(complianceRoutes);
  await app.register(attendanceRoutes);
  await app.register(attendanceRequestRoutes);
  await app.register(leaveRoutes);
  await app.register(reimbursementRoutes);
  await app.register(assetRoutes);
  await app.register(helpdeskRoutes);
  await app.register(accountsRoutes);
  await app.register(payrollEngineRoutes);
  await app.register(misRoutes);
  await app.register(accountsBillingRoutes);
  await app.register(importRoutes);
  await app.register(insightsRoutes);
  await app.register(bugRoutes);
  await app.register(announcementRoutes);
  await app.register(releaseRoutes);
  await app.register(adminRoutes);
  await app.register(reportRoutes);
  await app.register(leavePolicyRoutes);
  await app.register((await import("./modules/hr-ops.routes")).hrOpsRoutes);

  return app;
}

async function start() {
  const app = await buildServer();
  await app.ready();
  initSocketServer(app.server);

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  console.log(`🚀 ASA Portal API (Phase 3 — Fastify 5) listening on http://127.0.0.1:${env.PORT}`);

  const shutdown = async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  start().catch((err) => {
    console.error("Failed to start ASA Portal API:", err);
    process.exit(1);
  });
}
