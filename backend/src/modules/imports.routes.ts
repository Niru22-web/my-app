import fs from "fs";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../config/db";
import { ACCOUNTS_ROLES, authenticate, normRole } from "../plugins/auth";
import { parseBodyOrMultipart } from "../utils/uploads";
import { headerKey, parseDay, readSheet, sendWorkbook, templateWorkbook, type TemplateColumn } from "../utils/sheets";

/**
 * Bulk import from Excel / CSV for the registers people fill in by hand.
 *   GET  /api/imports/:kind/template          → Excel template (columns, a sample row, "How to fill")
 *   POST /api/imports/:kind?mode=check|import  → multipart "file"
 * "check" validates every row and saves nothing. "import" refuses if any row has a problem; otherwise each row is
 * created through the same API route the screen uses, so the same permissions and rules apply.
 */

interface Col extends TemplateColumn {
  key: string;
}
type Row = Record<string, string>;
interface Plan {
  /** Route the row is created through */
  url: string;
  body: Record<string, unknown>;
  /** Short description shown in the results */
  label: string;
}
interface Ctx {
  seen: Set<string>;
  lookups: Record<string, any>;
}
interface Kind {
  title: string;
  sheet: string;
  roles: string[];
  columns: Col[];
  notes?: string[];
  load: () => Promise<Record<string, any>>;
  /** Returns a plan, "skip:<reason>" for duplicates already in the portal, or an error message. */
  plan: (r: Row, ctx: Ctx) => Plan | string;
}

const yes = (v: string) => /^(y|yes|true|1)$/i.test(v.trim());
const no = (v: string) => /^(n|no|false|0)$/i.test(v.trim());
const ci = (v: string) => v.trim().toLowerCase();
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WORK_WRITE = ["admin", "owner", "partner", "manager", "it"];

const KINDS: Record<string, Kind> = {
  employees: {
    title: "Employees",
    sheet: "Employees",
    roles: ["admin", "owner", "hr"],
    notes: ["Each person is added as an invite (status Invited). Share their registration link from the Employees page."],
    columns: [
      { key: "firstName", header: "First name", required: true, example: "Priya", help: "Given name." },
      { key: "lastName", header: "Last name", example: "Sharma", help: "Family name." },
      { key: "officeEmail", header: "Office email", required: true, example: "priya.sharma@asaind.co.in", help: "Must be unique.", width: 30 },
      { key: "employeeId", header: "Employee ID", example: "", help: "Leave empty to number automatically." },
      { key: "designation", header: "Designation", example: "Associate", help: "Job title." },
      { key: "department", header: "Department", example: "Audit", help: "Team / department name." },
      { key: "role", header: "Role", example: "Employee", help: "Employee, Manager, Partner, HR, IT, Accounts. Admin/Owner only if you are an Admin or Owner." },
      { key: "managerEmail", header: "Reporting manager email", example: "", help: "Office email of an existing person.", width: 30 },
      { key: "partnerEmail", header: "Reporting partner email", example: "", help: "Office email of an existing partner.", width: 30 },
    ],
    load: async () => ({ people: await prisma.employee.findMany({ select: { id: true, officeEmail: true, employeeId: true } }) }),
    plan: (r, { seen, lookups }) => {
      if (!r.firstName) return "First name is missing.";
      if (!EMAIL.test(r.officeEmail)) return "Office email isn't valid.";
      const email = ci(r.officeEmail);
      if (seen.has(email)) return "This email appears twice in the file.";
      seen.add(email);
      if (lookups.people.some((p: any) => ci(p.officeEmail) === email)) return "skip:Already in the portal";
      if (r.employeeId && lookups.people.some((p: any) => ci(p.employeeId) === ci(r.employeeId))) return `Employee ID ${r.employeeId} is already used.`;
      const find = (e: string) => lookups.people.find((p: any) => ci(p.officeEmail) === ci(e));
      if (r.managerEmail && !find(r.managerEmail)) return `No one with email ${r.managerEmail} (manager).`;
      if (r.partnerEmail && !find(r.partnerEmail)) return `No one with email ${r.partnerEmail} (partner).`;
      return {
        url: "/api/employees",
        label: `${r.firstName} ${r.lastName}`.trim(),
        body: {
          firstName: r.firstName,
          lastName: r.lastName,
          officeEmail: email,
          ...(r.employeeId ? { employeeId: r.employeeId } : {}),
          ...(r.designation ? { designation: r.designation } : {}),
          ...(r.department ? { department: r.department } : {}),
          ...(r.role ? { role: r.role } : {}),
          reportingManagerIds: r.managerEmail ? [find(r.managerEmail).id] : [],
          reportingPartnerIds: r.partnerEmail ? [find(r.partnerEmail).id] : [],
        },
      };
    },
  },

  clients: {
    title: "Clients",
    sheet: "Clients",
    roles: WORK_WRITE,
    columns: [
      { key: "name", header: "Client name", required: true, example: "Sunrise Textiles Pvt Ltd", help: "Legal name.", width: 30 },
      { key: "alias", header: "Short name", example: "Sunrise", help: "Optional." },
      { key: "clientId", header: "Client code", example: "", help: "Leave empty to number automatically." },
      { key: "gstin", header: "GSTIN", example: "27ABCDE1234F1Z5", help: "15 characters. Leave empty if not GST-registered." },
      { key: "pan", header: "PAN", example: "ABCDE1234F", help: "10 characters." },
      { key: "address", header: "Address", example: "Andheri East, Mumbai", help: "Registered address.", width: 30 },
      { key: "state", header: "State", example: "Maharashtra", help: "Indian state (decides CGST/SGST vs IGST when there is no GSTIN)." },
      { key: "pin", header: "PIN code", example: "400069", help: "6 digits." },
      { key: "country", header: "Country", example: "India", help: "Defaults to India." },
      { key: "partnerEmail", header: "Engagement partner email", example: "", help: "Office email of a partner.", width: 30 },
    ],
    load: async () => ({
      clients: await prisma.client.findMany({ select: { name: true, clientId: true } }),
      partners: await prisma.employee.findMany({ where: { role: { in: ["Partner", "partner", "Owner", "owner"] } }, select: { id: true, officeEmail: true } }),
    }),
    plan: (r, { seen, lookups }) => {
      if (!r.name) return "Client name is missing.";
      const gstin = r.gstin.toUpperCase();
      const pan = r.pan.toUpperCase();
      if (gstin && !GSTIN.test(gstin)) return "GSTIN isn't valid.";
      if (pan && !PAN.test(pan)) return "PAN should look like ABCDE1234F.";
      if (r.pin && !/^\d{6}$/.test(r.pin)) return "PIN code must be 6 digits.";
      if (seen.has(ci(r.name))) return "This client appears twice in the file.";
      seen.add(ci(r.name));
      if (lookups.clients.some((c: any) => ci(c.name) === ci(r.name) || (r.clientId && ci(c.clientId) === ci(r.clientId)))) return "skip:Already in the portal";
      const partner = r.partnerEmail ? lookups.partners.find((p: any) => ci(p.officeEmail) === ci(r.partnerEmail)) : null;
      if (r.partnerEmail && !partner) return `No partner with email ${r.partnerEmail}.`;
      return {
        url: "/api/clients",
        label: r.name,
        body: {
          name: r.name,
          alias: r.alias || r.name.slice(0, 12),
          ...(r.clientId ? { clientId: r.clientId } : {}),
          gstStatus: gstin ? "Yes" : "No",
          gstin: gstin || null,
          pan,
          address: r.address || null,
          state: r.state || null,
          pin: r.pin || null,
          country: r.country || "India",
          status: "Active",
          ...(partner ? { partnerId: partner.id } : {}),
        },
      };
    },
  },

  projects: {
    title: "Projects",
    sheet: "Projects",
    roles: WORK_WRITE,
    columns: [
      { key: "name", header: "Project name", required: true, example: "Statutory audit FY 2026-27", help: "Name of the engagement.", width: 30 },
      { key: "client", header: "Client code or name", required: true, example: "CLI001", help: "An existing client (code like CLI001, or the exact name).", width: 24 },
      { key: "projectId", header: "Project code", example: "", help: "Leave empty to number automatically." },
      { key: "status", header: "Status", example: "Started", help: "Started, On Hold, Completed or Inactive. Default Started." },
      { key: "startDate", header: "Start date", example: "2026-04-01", help: "YYYY-MM-DD." },
      { key: "endDate", header: "End date", example: "", help: "Optional." },
      { key: "billable", header: "Billable", example: "Yes", help: "Yes or No. Default Yes." },
    ],
    load: async () => ({
      clients: await prisma.client.findMany({ select: { id: true, name: true, clientId: true } }),
      projects: await prisma.project.findMany({ select: { name: true, clientId: true, projectId: true } }),
    }),
    plan: (r, { seen, lookups }) => {
      if (!r.name) return "Project name is missing.";
      const client = lookups.clients.find((c: any) => ci(c.clientId) === ci(r.client) || ci(c.name) === ci(r.client));
      if (!client) return `Client "${r.client}" not found.`;
      const start = r.startDate ? parseDay(r.startDate) : null;
      if (r.startDate && !start) return "Start date isn't a valid date.";
      const end = r.endDate ? parseDay(r.endDate) : null;
      if (r.endDate && !end) return "End date isn't a valid date.";
      if (start && end && end < start) return "End date is before the start date.";
      if (r.billable && !yes(r.billable) && !no(r.billable)) return "Billable must be Yes or No.";
      const key = `${client.id}|${ci(r.name)}`;
      if (seen.has(key)) return "This project appears twice in the file.";
      seen.add(key);
      if (lookups.projects.some((p: any) => (p.clientId === client.id && ci(p.name) === ci(r.name)) || (r.projectId && ci(p.projectId) === ci(r.projectId)))) return "skip:Already in the portal";
      return {
        url: "/api/projects",
        label: `${r.name} (${client.name})`,
        body: { name: r.name, clientId: client.id, ...(r.projectId ? { projectId: r.projectId } : {}), status: r.status || "Started", startDate: start, endDate: end, billable: r.billable ? yes(r.billable) : true },
      };
    },
  },

  jobs: {
    title: "Jobs",
    sheet: "Jobs",
    roles: WORK_WRITE,
    columns: [
      { key: "name", header: "Job name", required: true, example: "Fieldwork", help: "Name of the task / job.", width: 28 },
      { key: "project", header: "Project code", required: true, example: "PRJ001", help: "An existing project code (see the Projects page)." },
      { key: "jobId", header: "Job code", example: "", help: "Leave empty to number automatically." },
      { key: "status", header: "Status", example: "Started", help: "Started, On Hold, Completed or Inactive. Default Started." },
      { key: "billable", header: "Billable", example: "Yes", help: "Yes or No. Default: same as the project." },
      { key: "startDate", header: "Start date", example: "", help: "Optional, YYYY-MM-DD." },
      { key: "endDate", header: "End date", example: "", help: "Optional." },
      { key: "description", header: "Description", example: "", help: "Optional.", width: 30 },
    ],
    load: async () => ({
      projects: await prisma.project.findMany({ select: { id: true, name: true, projectId: true } }),
      jobs: await prisma.job.findMany({ select: { name: true, projectId: true, jobId: true } }),
    }),
    plan: (r, { seen, lookups }) => {
      if (!r.name) return "Job name is missing.";
      const project = lookups.projects.find((p: any) => ci(p.projectId) === ci(r.project));
      if (!project) return `Project "${r.project}" not found.`;
      const start = r.startDate ? parseDay(r.startDate) : null;
      if (r.startDate && !start) return "Start date isn't a valid date.";
      const end = r.endDate ? parseDay(r.endDate) : null;
      if (r.endDate && !end) return "End date isn't a valid date.";
      if (r.billable && !yes(r.billable) && !no(r.billable)) return "Billable must be Yes or No.";
      const key = `${project.id}|${ci(r.name)}`;
      if (seen.has(key)) return "This job appears twice in the file.";
      seen.add(key);
      if (lookups.jobs.some((j: any) => (j.projectId === project.id && ci(j.name) === ci(r.name)) || (r.jobId && ci(j.jobId) === ci(r.jobId)))) return "skip:Already in the portal";
      return {
        url: "/api/jobs",
        label: `${r.name} (${project.projectId})`,
        body: {
          name: r.name,
          projectId: project.id,
          ...(r.jobId ? { jobId: r.jobId } : {}),
          status: r.status || "Started",
          ...(r.billable ? { billable: yes(r.billable) } : {}),
          startDate: start,
          endDate: end,
          description: r.description || null,
        },
      };
    },
  },

  assets: {
    title: "Assets",
    sheet: "Assets",
    roles: ["admin", "owner", "it", "hr", "accounts"],
    columns: [
      { key: "assetName", header: "Asset name", required: true, example: "Dell Latitude 5440", help: "Model / description.", width: 26 },
      { key: "category", header: "Category", required: true, example: "Laptop", help: "e.g. Laptop, Monitor, Phone." },
      { key: "type", header: "Type", required: true, example: "Hardware", help: "e.g. Hardware, Software, Accessory." },
      { key: "serialNumber", header: "Serial number", required: true, example: "SN123456", help: "Must be unique." },
      { key: "officeTagNo", header: "Office tag", example: "ASA-LT-001", help: "Optional." },
      { key: "condition", header: "Condition", example: "New", help: "New, Good, Fair or Poor." },
      { key: "purchaseDate", header: "Purchase date", example: "2026-04-15", help: "YYYY-MM-DD." },
      { key: "purchaseCost", header: "Purchase cost (₹)", example: "78000", help: "Number only." },
      { key: "vendor", header: "Vendor company", example: "", help: "Must match a vendor on the Vendors page." },
      { key: "warrantyExpiry", header: "Warranty expiry", example: "2029-04-14", help: "YYYY-MM-DD." },
      { key: "location", header: "Location", example: "Mumbai HO", help: "Optional." },
      { key: "description", header: "Remarks", example: "", help: "Optional.", width: 30 },
    ],
    load: async () => ({
      assets: await prisma.assetInventory.findMany({ select: { serialNumber: true } }),
      vendors: await prisma.vendor.findMany({ select: { id: true, company: true, vendorName: true } }),
    }),
    plan: (r, { seen, lookups }) => {
      for (const k of ["assetName", "category", "type", "serialNumber"] as const) if (!r[k]) return `${KINDS.assets.columns.find((c) => c.key === k)!.header} is missing.`;
      if (seen.has(ci(r.serialNumber))) return "This serial number appears twice in the file.";
      seen.add(ci(r.serialNumber));
      if (lookups.assets.some((a: any) => ci(a.serialNumber) === ci(r.serialNumber))) return "skip:Already in the portal";
      const purchaseDate = r.purchaseDate ? parseDay(r.purchaseDate) : null;
      if (r.purchaseDate && !purchaseDate) return "Purchase date isn't a valid date.";
      const warrantyExpiry = r.warrantyExpiry ? parseDay(r.warrantyExpiry) : null;
      if (r.warrantyExpiry && !warrantyExpiry) return "Warranty expiry isn't a valid date.";
      const cost = r.purchaseCost ? Number(r.purchaseCost.replace(/[,₹\s]/g, "")) : null;
      if (r.purchaseCost && !(cost! >= 0)) return "Purchase cost must be a number.";
      const vendor = r.vendor ? lookups.vendors.find((v: any) => ci(v.company) === ci(r.vendor) || ci(v.vendorName) === ci(r.vendor)) : null;
      if (r.vendor && !vendor) return `Vendor "${r.vendor}" not found — add it on the Vendors page first.`;
      return {
        url: "/api/assets",
        label: `${r.assetName} · ${r.serialNumber}`,
        body: {
          assetName: r.assetName,
          category: r.category,
          type: r.type,
          serialNumber: r.serialNumber,
          officeTagNo: r.officeTagNo || null,
          condition: r.condition || "New",
          purchaseDate,
          purchaseCost: cost,
          vendorId: vendor?.id ?? null,
          warrantyExpiry,
          location: r.location || null,
          description: r.description || null,
        },
      };
    },
  },

  vendors: {
    title: "Vendors",
    sheet: "Vendors",
    roles: ["admin", "owner", "it", "hr", "accounts"],
    columns: [
      { key: "company", header: "Company", required: true, example: "Techno Solutions LLP", help: "Vendor's company name.", width: 26 },
      { key: "vendorName", header: "Vendor name", required: true, example: "Rahul Mehta", help: "Contact or trade name." },
      { key: "contactPerson", header: "Contact person", example: "Rahul Mehta", help: "Optional." },
      { key: "email", header: "Email", example: "sales@techno.example", help: "Optional.", width: 26 },
      { key: "phone", header: "Phone", example: "9820000000", help: "Optional." },
      { key: "gstNumber", header: "GSTIN", example: "", help: "Optional, 15 characters." },
      { key: "address", header: "Address", example: "", help: "Optional.", width: 30 },
    ],
    load: async () => ({ vendors: await prisma.vendor.findMany({ select: { company: true, vendorName: true } }) }),
    plan: (r, { seen, lookups }) => {
      if (!r.company || !r.vendorName) return "Company and vendor name are required.";
      if (r.email && !EMAIL.test(r.email)) return "Email isn't valid.";
      if (r.gstNumber && !GSTIN.test(r.gstNumber.toUpperCase())) return "GSTIN isn't valid.";
      const key = `${ci(r.company)}|${ci(r.vendorName)}`;
      if (seen.has(key)) return "This vendor appears twice in the file.";
      seen.add(key);
      if (lookups.vendors.some((v: any) => `${ci(v.company)}|${ci(v.vendorName)}` === key)) return "skip:Already in the portal";
      return { url: "/api/assets/vendors", label: r.company, body: { ...r, gstNumber: r.gstNumber ? r.gstNumber.toUpperCase() : null } };
    },
  },

  holidays: {
    title: "Holidays",
    sheet: "Holidays",
    roles: ["admin", "owner", "hr"],
    notes: ["Holidays are excluded from leave days and expected hours for everyone."],
    columns: [
      { key: "date", header: "Date", required: true, example: "2026-10-20", help: "YYYY-MM-DD." },
      { key: "title", header: "Holiday", required: true, example: "Diwali", help: "Name of the holiday.", width: 28 },
    ],
    load: async () => ({ holidays: await prisma.event.findMany({ where: { type: "Holiday" }, select: { date: true, title: true } }) }),
    plan: (r, { seen, lookups }) => {
      const day = parseDay(r.date);
      if (!day) return "Date isn't a valid date.";
      if (!r.title) return "Holiday name is missing.";
      if (seen.has(day)) return "Two holidays on the same date in the file.";
      seen.add(day);
      if (lookups.holidays.some((h: any) => h.date.toISOString().slice(0, 10) === day)) return "skip:A holiday is already set for this date";
      return { url: "/api/events", label: `${day} · ${r.title}`, body: { title: r.title, date: day, type: "Holiday" } };
    },
  },
};

const allowed = (req: FastifyRequest, kind: Kind) => {
  const r = normRole(req.user!.role);
  return kind.roles.includes(r) || (kind.roles.includes("accounts") && (ACCOUNTS_ROLES.has(r) || !!req.user!.hasAccountsAccess));
};

export async function importRoutes(app: FastifyInstance) {
  app.get("/api/imports/:kind/template", { preHandler: [authenticate] }, async (req, reply) => {
    const kind = KINDS[(req.params as { kind: string }).kind];
    if (!kind) return reply.code(404).send({ success: false, message: "Nothing to import here." });
    const wb = templateWorkbook(kind.sheet, kind.columns, kind.notes);
    return sendWorkbook(reply, wb, `${kind.sheet.toLowerCase()}-import-template.xlsx`);
  });

  app.post("/api/imports/:kind", { preHandler: [authenticate] }, async (req, reply) => {
    const kind = KINDS[(req.params as { kind: string }).kind];
    if (!kind) return reply.code(404).send({ success: false, message: "Nothing to import here." });
    if (!allowed(req, kind)) return reply.code(403).send({ success: false, message: `You don’t have permission to import ${kind.title.toLowerCase()}.` });
    const mode = (req.query as { mode?: string }).mode === "import" ? "import" : "check";

    let parsed;
    try {
      parsed = await parseBodyOrMultipart(req, "temp");
    } catch (e) {
      return reply.code(400).send({ success: false, message: e instanceof Error ? e.message : "Upload failed." });
    }
    const file = parsed.files[0];
    if (!file) return reply.code(400).send({ success: false, message: "Choose the filled-in template (.xlsx or .csv)." });
    let sheet: string[][];
    try {
      sheet = await readSheet(file.diskPath, file.fileName);
    } catch {
      return reply.code(400).send({ success: false, message: "That file couldn't be read. Use the template (.xlsx or .csv)." });
    } finally {
      fs.promises.unlink(file.diskPath).catch(() => undefined);
    }

    // Match columns by header text, so column order doesn't matter.
    const [header = [], ...body] = sheet;
    const index = new Map(header.map((h, i) => [headerKey(h), i]));
    const missing = kind.columns.filter((c) => c.required && !index.has(headerKey(c.header)));
    if (missing.length) return reply.code(400).send({ success: false, message: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.map((c) => c.header).join(", ")}. Download the template and keep its header row.` });
    const sample = kind.columns.map((c) => String(c.example));
    const rows = body
      .map((cells, i) => ({ line: i + 2, cells }))
      .filter(({ cells }) => cells.some((c) => c) && !kind.columns.every((c, k) => (cells[index.get(headerKey(c.header)) ?? -1] ?? "") === sample[k]));
    if (!rows.length) return reply.code(400).send({ success: false, message: "The file has no rows to import (the grey sample row is ignored)." });
    if (rows.length > 2000) return reply.code(400).send({ success: false, message: "Import up to 2,000 rows at a time." });

    const ctx: Ctx = { seen: new Set(), lookups: await kind.load() };
    const results = rows.map(({ line, cells }) => {
      const r: Row = Object.fromEntries(kind.columns.map((c) => [c.key, (cells[index.get(headerKey(c.header)) ?? -1] ?? "").trim()]));
      const p = kind.plan(r, ctx);
      if (typeof p === "string") return p.startsWith("skip:") ? { line, status: "skip" as const, message: p.slice(5), label: r[kind.columns[0].key] } : { line, status: "error" as const, message: p, label: r[kind.columns[0].key] };
      return { line, status: "ok" as const, message: "Ready", label: p.label, plan: p };
    });
    const errors = results.filter((x) => x.status === "error").length;
    const summary = { total: results.length, ready: results.filter((x) => x.status === "ok").length, skipped: results.filter((x) => x.status === "skip").length, errors };
    const view = (x: (typeof results)[number]) => ({ line: x.line, status: x.status, message: x.message, label: x.label });

    if (mode === "check" || errors) {
      return reply.code(mode === "import" && errors ? 400 : 200).send({
        success: mode === "check",
        mode: "check",
        message: errors ? `${errors} row${errors > 1 ? "s need" : " needs"} fixing — nothing was imported.` : `${summary.ready} row${summary.ready === 1 ? "" : "s"} ready to import.`,
        summary,
        rows: results.map(view),
      });
    }

    // Create through the normal routes (same rules, permissions, numbering and notifications).
    let created = 0;
    const out = [];
    for (const x of results) {
      if (x.status !== "ok") {
        out.push(view(x));
        continue;
      }
      const res = await app.inject({ method: "POST", url: x.plan!.url, headers: { authorization: req.headers.authorization ?? "", "content-type": "application/json" }, payload: JSON.stringify(x.plan!.body) });
      const ok = res.statusCode < 300;
      if (ok) created++;
      let msg = "Imported";
      if (!ok) {
        try {
          msg = (JSON.parse(res.body) as { message?: string }).message ?? "Couldn’t import";
        } catch {
          msg = "Couldn’t import";
        }
      }
      out.push({ line: x.line, status: ok ? "imported" : "error", message: msg, label: x.label });
    }
    return reply.send({
      success: true,
      mode: "import",
      message: `${created} of ${summary.ready} imported${summary.skipped ? `, ${summary.skipped} already existed` : ""}.`,
      summary: { ...summary, imported: created, failed: summary.ready - created },
      rows: out,
    });
  });
}
