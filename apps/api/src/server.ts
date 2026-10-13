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
import { leaveRoutes } from "./modules/leaves.routes";
import { reimbursementRoutes } from "./modules/reimbursements.routes";
import { assetRoutes } from "./modules/assets.routes";
import { helpdeskRoutes } from "./modules/helpdesk.routes";
import { accountsRoutes } from "./modules/accounts.routes";
import { adminRoutes } from "./modules/admin.routes";
import { systemRoutes } from "./modules/system.routes";

export async function buildServer() {
  const app = Fastify({
    logger: env.NODE_ENV === "development",
    bodyLimit: 50 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: env.FRONTEND_URL || true,
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 10,
    },
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
  await app.register(leaveRoutes);
  await app.register(reimbursementRoutes);
  await app.register(assetRoutes);
  await app.register(helpdeskRoutes);
  await app.register(accountsRoutes);
  await app.register(adminRoutes);

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
