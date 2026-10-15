import fs from "fs";
import path from "path";
import type { FastifyReply } from "fastify";
import { prisma } from "../config/db";
import { env } from "../config/env";
import { ACCOUNTS_ROLES, normRole, reportingTreeIds, type JwtUser } from "../plugins/auth";

// ── Who may open an uploaded file ────────────────────────────────────────────
// Files are looked up by the record that owns them:
//   profile/        profile photos — readable by any signed-in person (shown across the portal)
//   documents/ (+ old files at the root)  KYC & employee documents — the person, HR/Admin/Owner,
//                   and their managers/partners (not IT)
//   reimbursements/ receipts — the claimant, their reporting line, HR, Admin, Finance/Accounts
//   tickets/        attachments — requester, assignee, HR, IT, Admin
//   temp/, logs/, anything unknown — Admin/Owner only

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
  ".pdf": "application/pdf", ".csv": "text/csv", ".txt": "text/plain",
};

/** Resolves an uploads-relative path safely inside the uploads folder, or null. */
export function resolveUpload(rel: string): string | null {
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^uploads\//, "");
  const base = path.resolve(env.UPLOADS_DIR);
  const full = path.resolve(base, clean);
  if (!full.startsWith(base + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

/** Streams a file with safe headers (images/PDF inline, everything else as a download). */
export function sendUpload(reply: FastifyReply, full: string, downloadName?: string) {
  const type = MIME[path.extname(full).toLowerCase()] ?? "application/octet-stream";
  reply.header("Content-Type", type);
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Cache-Control", "private, max-age=300");
  const name = (downloadName ?? path.basename(full)).replace(/["\r\n]/g, "");
  reply.header("Content-Disposition", `${type.startsWith("image/") || type === "application/pdf" ? "inline" : "attachment"}; filename="${name}"`);
  return reply.send(fs.createReadStream(full));
}

/** Every stored spelling of the same file ("/uploads/x", "uploads/x", "x", absolute URLs). */
function variants(rel: string) {
  const r = rel.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^uploads\//, "");
  return { r, list: [`/uploads/${r}`, `uploads/${r}`, r] };
}

export function uploadFolder(rel: string) {
  const r = rel.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^uploads\//, "");
  return r.includes("/") ? r.split("/")[0] : "";
}

async function inLeadTree(u: JwtUser, ownerId: string) {
  return (await reportingTreeIds(u.id)).includes(ownerId);
}

/**
 * A claim attachment: the claimant, their reporting line, HR and Finance (Accounts roles or Accounts access).
 * undefined = the file isn't a claim attachment.
 */
async function claimReadable(u: JwtUser, r: string, match: (field: string) => object): Promise<boolean | undefined> {
  const att = await prisma.reimbursementAttachment.findFirst({ where: match("filePath"), select: { reimbursement: { select: { employeeId: true } } } });
  if (!att) return undefined;
  const owner = att.reimbursement.employeeId;
  if (owner === u.id || r === "hr" || ACCOUNTS_ROLES.has(r) || u.hasAccountsAccess) return true;
  return inLeadTree(u, owner);
}

export async function canReadUpload(u: JwtUser, rel: string): Promise<boolean> {
  const r = normRole(u.role);
  if (r === "admin" || r === "owner") return true;
  const folder = uploadFolder(rel);
  const { r: name, list } = variants(rel);
  const match = (field: string) => ({ OR: [...list.map((v) => ({ [field]: v })), { [field]: { endsWith: `/${name}` } }] });

  if (folder === "profile") return true;

  if (folder === "documents" || folder === "") {
    const doc = await prisma.employeeDocument.findFirst({ where: match("filePath"), select: { employeeId: true } });
    const prof = doc
      ? null
      : await prisma.employeeProfile.findFirst({
          where: { OR: [match("panFileUrl"), match("aadhaarFileUrl"), match("bankStatementFileUrl"), match("profileImage")] },
          select: { employeeId: true },
        });
    const owner = doc?.employeeId ?? prof?.employeeId;
    // Claim receipts are stored here too.
    if (!owner) return (await claimReadable(u, r, match)) ?? r === "hr";
    if (owner === u.id || r === "hr") return true;
    return ["manager", "partner", "sub-manager", "sub manager"].includes(r) && (await inLeadTree(u, owner));
  }

  if (folder === "reimbursements") return (await claimReadable(u, r, match)) ?? (r === "hr" || ACCOUNTS_ROLES.has(r) || !!u.hasAccountsAccess);

  if (folder === "tickets") {
    const att = await prisma.ticketAttachment.findFirst({ where: match("url"), select: { ticket: { select: { createdById: true, assignedTo: true } } } });
    if (r === "hr" || r === "it") return true;
    const t = att?.ticket;
    return !!t && (t.createdById === u.id || t.assignedTo === u.id || (await inLeadTree(u, t.createdById)));
  }

  // Bug tracker screenshots: reporter, assignee, Admin/Owner/IT, and anyone who commented on that bug.
  if (folder === "bugs") return (await import("./bug-access")).canReadBugFile(u, list);

  return false; // temp/, logs/, anything else: Admin/Owner only
}
