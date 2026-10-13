import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { FastifyRequest } from "fastify";
import { env } from "../config/env";

const BLOCKED_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".svg",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".exe",
  ".bat",
  ".cmd",
  ".ps1",
  ".sh",
  ".php",
]);

export interface SavedUpload {
  fieldName: string;
  fileName: string;
  savedName: string;
  filePath: string; // e.g. /uploads/documents/1728...-receipt.pdf
  diskPath: string;
  fileSize: number;
  mimeType: string;
}

export interface ParsedMultipart {
  fields: Record<string, string>;
  files: SavedUpload[];
}

export function ensureUploadsSubdir(subdir: string): string {
  const dir = path.join(env.UPLOADS_DIR, subdir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Parses either a JSON request body or a multipart/form-data request,
 * saving any uploaded files into the specified subdirectory (or a per-field subdirectory map).
 */
export async function parseBodyOrMultipart(
  req: FastifyRequest,
  defaultSubdir = "documents",
  fieldSubdirMap: Record<string, string> = {},
): Promise<ParsedMultipart> {
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.includes("multipart/form-data")) {
    const rawBody = (req.body ?? {}) as Record<string, unknown>;
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawBody)) {
      if (v !== undefined && v !== null) {
        fields[k] = typeof v === "string" ? v : String(v);
      }
    }
    return { fields, files: [] };
  }

  const fields: Record<string, string> = {};
  const files: SavedUpload[] = [];

  const parts = req.parts();
  for await (const part of parts) {
    if (part.type === "field") {
      fields[part.fieldname] = String(part.value ?? "");
    } else if (part.type === "file") {
      const origName = path.basename(part.filename || "upload");
      const ext = path.extname(origName).toLowerCase();
      if (BLOCKED_EXTENSIONS.has(ext)) {
        // Consume stream before throwing
        await part.toBuffer();
        throw new Error(`File type ${ext} is not allowed for security reasons.`);
      }
      const buffer = await part.toBuffer();
      if (buffer.length === 0) continue;

      const subdir = fieldSubdirMap[part.fieldname] ?? defaultSubdir;
      const dir = ensureUploadsSubdir(subdir);
      const safeBase = origName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const savedName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeBase}`;
      const diskPath = path.join(dir, savedName);
      fs.writeFileSync(diskPath, buffer);

      files.push({
        fieldName: part.fieldname,
        fileName: origName,
        savedName,
        filePath: `/uploads/${subdir}/${savedName}`,
        diskPath,
        fileSize: buffer.length,
        mimeType: part.mimetype || "application/octet-stream",
      });
    }
  }

  return { fields, files };
}
