import fs from "fs";
import os from "os";
import path from "path";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env";
import { prisma } from "../config/db";
import { requireRoles } from "../plugins/auth";

const ALLOWED_STORAGE_CATEGORIES = new Set(["all", "profile", "documents", "tickets", "temp", "logs"]);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

interface StoredFileItem {
  name: string;
  relativePath: string;
  category: string;
  sizeBytes: number;
  sizeFormatted: string;
  modifiedAt: string;
  url: string;
}

function scanCategoryDir(dir: string, baseDir: string, category: string, out: StoredFileItem[]) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanCategoryDir(full, baseDir, category, out);
    } else if (entry.isFile()) {
      const stat = fs.statSync(full);
      const rel = path.relative(baseDir, full).replace(/\\/g, "/");
      out.push({
        name: entry.name,
        relativePath: rel,
        category,
        sizeBytes: stat.size,
        sizeFormatted: formatBytes(stat.size),
        modifiedAt: stat.mtime.toISOString(),
        url: category === "logs" ? `/uploads/logs/${entry.name}` : `/uploads/${rel}`,
      });
    }
  }
}

export async function systemRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({
    status: "OK",
    service: "asa-portal-api",
    timestamp: new Date().toISOString(),
  }));

  app.get("/api/ping", async () => ({ pong: true }));

  // Serve /uploads/* safely with path-traversal containment (fixes AD6, H6)
  app.get("/uploads/*", async (req, reply) => {
    const rel = ((req.params as { "*": string })["*"] ?? "").replace(/^[/\\]+/, "");
    const baseDir = path.resolve(env.UPLOADS_DIR);
    const resolved = path.resolve(baseDir, rel);

    if (!resolved.startsWith(baseDir + path.sep) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return reply.code(404).send({ success: false, message: "File not found" });
    }

    const ext = path.extname(resolved).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".pdf": "application/pdf",
      ".csv": "text/csv",
      ".txt": "text/plain",
    };
    const contentType = mimeMap[ext] ?? "application/octet-stream";
    reply.header("Content-Type", contentType);
    reply.header("X-Content-Type-Options", "nosniff");
    if (!contentType.startsWith("image/") && contentType !== "application/pdf") {
      reply.header("Content-Disposition", `attachment; filename="${path.basename(resolved)}"`);
    }
    return reply.send(fs.createReadStream(resolved));
  });

  // GET /api/system/status — uses real prisma.ticket.count() (fixes AD12)
  app.get(
    "/api/system/status",
    { preHandler: [requireRoles(["admin", "owner", "it", "hr"])] },
    async (_req, reply) => {
      const t0 = Date.now();
      const [employees, clients, projects, jobs, timelogs, tickets] = await Promise.all([
        prisma.employee.count(),
        prisma.client.count(),
        prisma.project.count(),
        prisma.job.count(),
        prisma.timelog.count(),
        prisma.ticket.count(),
      ]);
      const latencyMs = Date.now() - t0;

      const baseDir = path.resolve(env.UPLOADS_DIR);
      const breakdown: Record<string, { formatted: string; count: number }> = {};
      let totalBytes = 0;
      let totalFiles = 0;

      for (const cat of ["profile", "documents", "tickets", "temp", "logs"]) {
        const dir = path.join(baseDir, cat);
        let catBytes = 0;
        let catCount = 0;
        if (fs.existsSync(dir)) {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isFile()) {
              catCount++;
              catBytes += fs.statSync(path.join(dir, entry.name)).size;
            }
          }
        }
        totalBytes += catBytes;
        totalFiles += catCount;
        breakdown[cat] = { formatted: formatBytes(catBytes), count: catCount };
      }

      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedPct = Math.round(((totalMem - freeMem) / totalMem) * 100);
      const cpus = os.cpus();

      return reply.send({
        success: true,
        data: {
          server: {
            status: "Online",
            environment: env.NODE_ENV,
            nodeVersion: process.version,
            uptimeFormatted: formatUptime(process.uptime()),
            serverTime: new Date().toISOString(),
          },
          memory: {
            systemUsedPercent: usedPct,
            heapUsedFormatted: formatBytes(process.memoryUsage().heapUsed),
            rssFormatted: formatBytes(process.memoryUsage().rss),
          },
          cpu: {
            cores: cpus.length,
            model: cpus[0]?.model ?? "Server CPU",
            loadAverage: os.loadavg(),
          },
          database: {
            status: "Connected",
            latencyMs,
            counts: { employees, clients, projects, jobs, timelogs, tickets },
          },
          storage: {
            totalFormatted: formatBytes(totalBytes),
            totalFiles,
            breakdown,
          },
        },
      });
    },
  );

  // GET /api/system/storage/files — whitelists category to prevent path traversal (fixes AD6)
  app.get(
    "/api/system/storage/files",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const { category = "all", search = "", page = "1", limit = "25" } = (req.query ?? {}) as {
        category?: string;
        search?: string;
        page?: string;
        limit?: string;
      };
      if (!ALLOWED_STORAGE_CATEGORIES.has(category)) {
        return reply.code(400).send({
          success: false,
          message: "Invalid storage category",
        });
      }

      const baseDir = path.resolve(env.UPLOADS_DIR);
      const cats = category === "all" ? ["profile", "documents", "tickets", "temp", "logs"] : [category];
      const allFiles: StoredFileItem[] = [];

      for (const cat of cats) {
        const dir = path.resolve(baseDir, cat);
        if (dir.startsWith(baseDir + path.sep)) {
          scanCategoryDir(dir, baseDir, cat, allFiles);
        }
      }

      const q = search.trim().toLowerCase();
      const filtered = q
        ? allFiles.filter((f) => f.name.toLowerCase().includes(q) || f.relativePath.toLowerCase().includes(q))
        : allFiles;

      filtered.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.min(100, Math.max(1, Number(limit) || 25));
      const total = filtered.length;
      const paginated = filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      return reply.send({
        success: true,
        data: paginated,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.max(1, Math.ceil(total / limitNum)),
        },
      });
    },
  );

  // DELETE /api/system/storage/file — safe single-file deletion with path-traversal containment (fixes AD6)
  app.delete(
    "/api/system/storage/file",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const { relativePath } = (req.body ?? {}) as { relativePath?: string; category?: string };
      if (!relativePath || typeof relativePath !== "string" || relativePath.includes("..") || relativePath.includes("\0")) {
        return reply.code(400).send({ success: false, message: "Valid relativePath is required." });
      }

      const baseDir = path.resolve(env.UPLOADS_DIR);
      const cleanRel = relativePath.replace(/^[/\\]+/, "");
      const resolved = path.resolve(baseDir, cleanRel);

      if (!resolved.startsWith(baseDir + path.sep)) {
        return reply.code(403).send({ success: false, message: "Access denied: path outside uploads directory." });
      }
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        return reply.code(404).send({ success: false, message: "File not found." });
      }

      fs.unlinkSync(resolved);
      return reply.send({ success: true, message: "File deleted." });
    },
  );

  // POST /api/system/storage/cleanup
  app.post(
    "/api/system/storage/cleanup",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const { action } = (req.body ?? {}) as { action?: "clean_temp" | "clean_logs" };
      if (!action || !["clean_temp", "clean_logs"].includes(action)) {
        return reply.code(400).send({ success: false, message: "Invalid cleanup action." });
      }

      const subdir = action === "clean_temp" ? "temp" : "logs";
      const targetDir = path.resolve(env.UPLOADS_DIR, subdir);
      let removed = 0;
      if (fs.existsSync(targetDir)) {
        for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
          if (entry.isFile()) {
            fs.unlinkSync(path.join(targetDir, entry.name));
            removed++;
          }
        }
      }

      return reply.send({
        success: true,
        message: `Cleaned ${removed} file(s) from ${subdir}.`,
      });
    },
  );
}
