// One-off migration: Zoho People exports + ASA Asset Lifecycle register → portal database.
// Idempotent: re-running updates rows it created before (matched on employee ID / name / serial).
//
//   node scripts/import-zoho.cjs --dir "C:/Users/SHIVA/Downloads" --assets "<path to asa-laptop-lifecycle/src/data/seed.json>" --timesheets "Timesheets.xlsx" [--as admin@email] [--dry-run]
//
// Rules agreed with the firm (13 Oct 2026):
//   • Employees are imported ACTIVE + APPROVED with NO password (they get invites at go-live).
//   • Zoho "Department" holds the partner's name → becomes the reporting partner; department stays "General".
//   • Only jobs that belong to a project, and only projects that have at least one job, are imported.
//   • Zoho's system user "Zoho Admin" (ID 1) is never imported.
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
require("dotenv").config({ path: require("path").resolve(__dirname, "../../legacy/timesheet-backend/.env") });
const path = require("path");
const ExcelJS = require("exceljs");
const { PrismaClient } = require("@prisma/client");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]);
    return acc;
  }, []),
);
const DIR = args.dir || "C:/Users/SHIVA/Downloads";
const DRY = !!args["dry-run"];
const prisma = new PrismaClient();
const report = [];
const note = (s) => report.push(s);

// ── helpers ──────────────────────────────────────────────────────────────────
function text(v) {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
  }
  return String(v).trim();
}
async function readSheet(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(DIR, file));
  const ws = wb.worksheets[0];
  const head = ws.getRow(1).values.slice(1).map(text);
  const rows = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const o = {};
    head.forEach((h, i) => (o[h] = row.getCell(i + 1).value));
    rows.push(o);
  });
  return rows;
}
// Zoho exports dates as IST midnight (18:29:50Z the day before) or "21-Aug-2024" strings → calendar date at UTC midnight.
const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function day(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const d = new Date(v.getTime() + 6 * 3600e3);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const s = text(v);
  let m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], MON[m[2].toLowerCase()], +m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return null;
}
const ids = (v) => text(v).split(";").map((s) => s.trim()).filter((s) => s && s !== "1");
const normName = (s) => text(s).toLowerCase().replace(/\s+/g, " ").trim();
const title = (s) => text(s).replace(/\s+/g, " ").trim();
function gender(v) {
  const s = text(v).toLowerCase();
  if (/^f/.test(s)) return "Female";
  if (/^m/.test(s)) return "Male";
  return null;
}
function employmentType(v) {
  const s = text(v).toLowerCase();
  if (!s) return null;
  if (/article/.test(s)) return "Article";
  if (/intern/.test(s)) return "Intern";
  if (/trainee/.test(s)) return "Trainee";
  if (/part/.test(s)) return "Part Time";
  if (/full|perm/.test(s)) return "Full Time";
  return title(v);
}
const ROLE = { admin: "Admin", manager: "Manager", partner: "Partner", "team member": "Employee" };
function nextCode(prefix, existing, pad = 3) {
  let max = 0;
  for (const c of existing) {
    const m = String(c ?? "").match(/(\d+)$/);
    if (m && +m[1] > max) max = +m[1];
  }
  return () => `${prefix}${String(++max).padStart(pad, "0")}`;
}

async function main() {
  console.log(`Database: ${(process.env.DATABASE_URL || "").replace(/:\/\/[^@]*@/, "://***@")}${DRY ? "  (DRY RUN)" : ""}`);
  if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL || "") && !args["allow-remote"]) {
    throw new Error("Refusing to run against a non-local database without --allow-remote.");
  }

  const actor =
    (args.as && (await prisma.employee.findFirst({ where: { officeEmail: { equals: args.as, mode: "insensitive" } } }))) ||
    (await prisma.employee.findFirst({ where: { role: { equals: "Admin", mode: "insensitive" }, status: { equals: "active", mode: "insensitive" } }, orderBy: { createdAt: "asc" } }));
  if (!actor) throw new Error("No admin found to record as creator. Pass --as <admin email>.");

  // ── 1. Employees ───────────────────────────────────────────────────────────
  const E = (await readSheet("Employee View.xlsx")).filter((r) => text(r["Employee ID"]) && text(r["Employee ID"]) !== "1");
  const byCode = new Map(); // Zoho employee ID → portal Employee.id
  let empNew = 0, empUpd = 0, profiles = 0;
  for (const r of E) {
    const code = text(r["Employee ID"]);
    const email = text(r["Email address"]).toLowerCase();
    const designationRaw = title(r["Designation"]);
    const data = {
      firstName: title(r["First Name"]),
      lastName: title(r["Last Name"]),
      officeEmail: email,
      designation: designationRaw || "Not set",
      role: designationRaw.toUpperCase() === "HR" ? "HR" : ROLE[text(r["Zoho Role"]).toLowerCase()] ?? "Employee",
      status: "active",
      approvalStatus: "APPROVED",
      isApproved: true,
    };
    const existing =
      (await prisma.employee.findUnique({ where: { employeeId: code } })) ||
      (await prisma.employee.findFirst({ where: { officeEmail: { equals: email, mode: "insensitive" } } }));
    let emp;
    if (DRY) emp = existing ?? { id: `dry-${code}` };
    else if (existing) {
      // never touch password / approval history / role of an existing account (roles are managed in the portal)
      const { status, approvalStatus, isApproved, role, ...safe } = data;
      emp = await prisma.employee.update({ where: { id: existing.id }, data: safe });
    } else {
      emp = await prisma.employee.create({ data: { ...data, employeeId: code, department: "General", approvedAt: new Date(), approvedBy: actor.id } });
    }
    existing ? empUpd++ : empNew++;
    byCode.set(code, emp.id);

    const dob = day(r["Date of Birth"]), doj = day(r["Date of Joining"]);
    if (dob && doj && !DRY) {
      const prof = {
        dob, doj,
        gender: gender(r["Gender"]),
        maritalStatus: title(r["Marital Status"]) || null,
        currentAddress: title(r["Present Address"]) || null,
        permanentAddress: title(r["Permanent Address"]) || null,
        pan: text(r["PAN"]).toUpperCase() || null,
        aadhaar: text(r["Aadhaar"]).replace(/\s+/g, "") || null,
        personalEmail: text(r["Personal Email Address"]) || null,
        personalMobile: text(r["Personal Mobile Number"]) || null,
        employmentType: employmentType(r["Employment Type"]),
      };
      await prisma.employeeProfile.upsert({ where: { employeeId: emp.id }, create: { employeeId: emp.id, ...prof }, update: prof });
      profiles++;
    } else if (!dob || !doj) note(`Employee ${code}: no profile created (missing ${!dob ? "date of birth" : ""}${!dob && !doj ? " and " : ""}${!doj ? "joining date" : ""})`);
  }

  // Reporting lines (second pass, everyone exists now)
  const nameToId = new Map(E.map((r) => [normName(`${text(r["First Name"])} ${text(r["Last Name"])}`), byCode.get(text(r["Employee ID"]))]));
  const refId = (v) => {
    const s = text(v);
    if (!s) return null;
    const m = s.match(/(\S+)\s*$/);
    return (m && byCode.get(m[1])) || nameToId.get(normName(s.replace(/\s+\S*\d\S*$/, ""))) || null;
  };
  let lines = 0;
  for (const r of E) {
    const id = byCode.get(text(r["Employee ID"]));
    const mgr = refId(r["Reporting Manager"]);
    const sub = refId(r["Secondary Reporting Manager"]);
    const ptr = nameToId.get(normName(r["Department"])) ?? null;
    if (text(r["Reporting Manager"]) && !mgr) note(`Employee ${text(r["Employee ID"])}: reporting manager "${text(r["Reporting Manager"])}" not found`);
    if (text(r["Department"]) && !ptr) note(`Employee ${text(r["Employee ID"])}: partner "${text(r["Department"])}" not found`);
    if (DRY) continue;
    const m = mgr && mgr !== id ? mgr : null, p = ptr && ptr !== id ? ptr : null, s = sub && sub !== id ? sub : null;
    await prisma.employee.update({
      where: { id },
      data: {
        managerId: m, reportingManagerIds: m ? [m] : [],
        partnerId: p, reportingPartnerIds: p ? [p] : [],
        subManagerId: s, subManagerIds: s ? [s] : [],
      },
    });
    if (m) await prisma.employeeManager.upsert({ where: { employeeId_managerId: { employeeId: id, managerId: m } }, create: { employeeId: id, managerId: m }, update: {} });
    if (p) await prisma.employeePartner.upsert({ where: { employeeId_partnerId: { employeeId: id, partnerId: p } }, create: { employeeId: id, partnerId: p }, update: {} });
    if (m || p) lines++;
  }
  // Anyone who heads a partner group (named in Zoho "Department") is a Partner, unless already Admin.
  const partnerIds = [...new Set(E.map((r) => nameToId.get(normName(r["Department"]))).filter(Boolean))];
  if (!DRY && partnerIds.length) {
    const promoted = await prisma.employee.updateMany({
      where: { id: { in: partnerIds }, NOT: { role: { in: ["Admin", "Partner", "Owner"], mode: "insensitive" } } },
      data: { role: "Partner" },
    });
    if (promoted.count) note(`${promoted.count} partner-group heads set to role Partner`);
  }
  console.log(`Employees: ${empNew} new, ${empUpd} updated, ${profiles} profiles, ${lines} with reporting lines`);

  // ── 2. Clients ─────────────────────────────────────────────────────────────
  const C = (await readSheet("Clients.xlsx")).filter((r) => title(r["Client Name"]));
  const nextCli = nextCode("CLI", (await prisma.client.findMany({ select: { clientId: true } })).map((c) => c.clientId));
  const clientByName = new Map();
  let cliNew = 0;
  for (const r of C) {
    const name = title(r["Client Name"]);
    const addr = [r["Street Address"], r["City"]].map(title).filter(Boolean).join(", ");
    const data = {
      name,
      address: addr || null,
      state: title(r["State/Province"]) || null,
      pin: text(r["ZIP/PIN Code"]) || null,
      country: title(r["Country"]) || null,
    };
    let c = await prisma.client.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (!c) {
      cliNew++;
      if (!DRY)
        c = await prisma.client.create({
          data: { ...data, clientId: nextCli(), alias: name.slice(0, 12), gstStatus: "No", pan: "", status: "Active", createdBy: actor.id },
        });
      else c = { id: `dry-${name}` };
    } else if (!DRY) c = await prisma.client.update({ where: { id: c.id }, data });
    clientByName.set(name.toLowerCase(), c);
  }
  console.log(`Clients: ${cliNew} new, ${C.length - cliNew} updated`);

  // ── 3. Projects + Jobs (only projects that have jobs; only jobs that have a project) ──
  const P = await readSheet("Projects.xlsx");
  const J = (await readSheet("Jobs.xlsx")).filter((r) => title(r["Project Name"]) && title(r["Job Name"]));
  const jobsByProject = new Map();
  for (const j of J) {
    const k = title(j["Project Name"]).toLowerCase();
    if (!jobsByProject.has(k)) jobsByProject.set(k, []);
    jobsByProject.get(k).push(j);
  }
  // Zoho jobs reference a project by name only; where two projects share a name, prefer the one with a client.
  const projRows = new Map();
  for (const r of P) {
    const k = title(r["Project Name"]).toLowerCase();
    if (!jobsByProject.has(k)) { note(`Project skipped (no jobs): ${title(r["Project Name"])}`); continue; }
    if (projRows.has(k) && !title(r["Client Name"])) { note(`Project skipped (duplicate name, no client): ${title(r["Project Name"])}`); continue; }
    if (projRows.has(k)) note(`Project skipped (duplicate name, no client): ${title(projRows.get(k)["Project Name"])}`);
    projRows.set(k, r);
  }
  for (const k of jobsByProject.keys()) if (!projRows.has(k)) note(`Jobs skipped (project "${k}" not in Projects.xlsx): ${jobsByProject.get(k).length}`);

  const nextPrj = nextCode("PRJ", (await prisma.project.findMany({ select: { projectId: true } })).map((p) => p.projectId));
  const nextJob = nextCode("JOB", (await prisma.job.findMany({ select: { jobId: true } })).map((j) => j.jobId));
  let prjNew = 0, jobNew = 0, jobMerged = 0, members = 0;
  for (const [k, r] of projRows) {
    const name = title(r["Project Name"]);
    const client = clientByName.get(title(r["Client Name"]).toLowerCase());
    if (!client) { note(`Project skipped (client "${title(r["Client Name"])}" not in Clients.xlsx): ${name}`); continue; }
    const jobs = jobsByProject.get(k);
    const starts = jobs.map((j) => day(j["Start Date"])).filter(Boolean).sort((a, b) => a - b);
    const head = ids(r["Project Head(Employee Id)"]).map((i) => byCode.get(i)).filter(Boolean);
    const mgrs = ids(r["Project Manager(Employee Id)"]).map((i) => byCode.get(i)).filter(Boolean);
    const users = ids(r["Project Users(Employee Id)"]).map((i) => byCode.get(i)).filter(Boolean);
    const missing = [...ids(r["Project Head(Employee Id)"]), ...ids(r["Project Manager(Employee Id)"]), ...ids(r["Project Users(Employee Id)"])].filter((i) => !byCode.has(i));
    if (missing.length) note(`Project ${name}: member IDs not in employee sheet: ${[...new Set(missing)].join(", ")}`);
    const pdata = {
      name,
      clientId: client.id,
      status: "Started",
      startDate: starts[0] ?? new Date(),
      billable: !/^idle$/i.test(title(r["Client Name"])),
      partnerId: head[0] ?? null,
      managerId: mgrs[0] ?? null,
    };
    let proj = DRY ? null : await prisma.project.findFirst({ where: { name: { equals: name, mode: "insensitive" }, clientId: client.id }, include: { client: true } });
    if (!proj) {
      prjNew++;
      if (!DRY) proj = await prisma.project.create({ data: { ...pdata, projectId: nextPrj(), createdBy: actor.id, createdByEmail: actor.officeEmail }, include: { client: true } });
    } else proj = await prisma.project.update({ where: { id: proj.id }, data: pdata, include: { client: true } });
    const team = [...new Set([...head, ...mgrs, ...users])];
    if (!DRY) {
      await prisma.projectUser.createMany({ data: team.map((employeeId) => ({ projectId: proj.id, employeeId })), skipDuplicates: true });
      members += team.length;
    }

    // Zoho has repeated job names inside a project → one portal job, assignees combined.
    const merged = new Map();
    for (const j of jobs) {
      const jk = title(j["Job Name"]).toLowerCase();
      if (merged.has(jk)) { jobMerged++; merged.get(jk).push(j); } else merged.set(jk, [j]);
    }
    for (const group of merged.values()) {
      const j = group[0];
      const name = title(j["Job Name"]);
      const bill = group.map((g) => text(g["Billable Status"]).toLowerCase()).find(Boolean);
      const jstarts = group.map((g) => day(g["Start Date"])).filter(Boolean).sort((a, b) => a - b);
      const jends = group.map((g) => day(g["End Date"])).filter(Boolean).sort((a, b) => b - a);
      const desc = group.map((g) => title(g["Description"])).filter(Boolean)[0] ?? null;
      const jdata = {
        name,
        status: "Started",
        billable: bill ? bill === "billable" : pdata.billable,
        startDate: jstarts[0] ?? null,
        endDate: jends[0] ?? null,
        description: desc,
      };
      if (DRY) { jobNew++; continue; }
      let job = await prisma.job.findFirst({ where: { projectId: proj.id, name: { equals: name, mode: "insensitive" } } });
      if (!job) {
        jobNew++;
        const jobId = nextJob();
        job = await prisma.job.create({
          data: { ...jdata, jobId, combinedId: `${proj.client.clientId}-${proj.projectId}-${jobId}`, projectId: proj.id, createdBy: actor.id, createdByEmail: actor.officeEmail },
        });
      } else job = await prisma.job.update({ where: { id: job.id }, data: jdata });
      const assignees = [...new Set(group.flatMap((g) => ids(g["Assignees(Employee Id)"])).map((i) => byCode.get(i)).filter(Boolean))];
      await prisma.jobUser.createMany({ data: assignees.map((employeeId) => ({ jobId: job.id, employeeId })), skipDuplicates: true });
    }
  }
  console.log(`Projects: ${projRows.size} with jobs (${prjNew} new), ${members} team links · Jobs: ${jobNew} new (${jobMerged} duplicate Zoho rows merged)`);

  // ── 4. Holidays → calendar events ──────────────────────────────────────────
  const H = await readSheet("Holiday_01-Mar-2026_28-Feb-2027.xlsx");
  let hol = 0;
  for (const r of H) {
    const from = day(r["From"]), to = day(r["To"]) ?? from;
    if (!from) continue;
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400e3)) {
      const t = title(r["Name"]);
      const exists = await prisma.event.findFirst({ where: { title: t, date: d, type: "Holiday" } });
      if (!exists && !DRY) await prisma.event.create({ data: { title: t, date: d, type: "Holiday", createdById: actor.id } });
      if (!exists) hol++;
    }
  }
  console.log(`Holidays: ${hol} new calendar days`);

  // ── 5. Asset register (ASA Asset Lifecycle app) ────────────────────────────
  if (args.assets) {
    const seed = require(path.resolve(args.assets));
    const vendorByName = new Map();
    let venNew = 0;
    for (const v of [...new Set(seed.purchases.map((p) => title(p.vendor)).filter(Boolean))]) {
      let row = await prisma.vendor.findFirst({ where: { vendorName: { equals: v, mode: "insensitive" } } });
      if (!row) { venNew++; if (!DRY) row = await prisma.vendor.create({ data: { vendorName: v, company: v } }); }
      vendorByName.set(v.toLowerCase(), row);
    }
    const purchaseBySerial = new Map(seed.purchases.filter((p) => p.serial).map((p) => [p.serial, p]));
    const seedEmp = new Map(seed.employees.map((e) => [e.id, e]));
    const allEmps = await prisma.employee.findMany({ select: { id: true, firstName: true, lastName: true } });
    const portalByName = new Map(allEmps.map((e) => [normName(`${e.firstName} ${e.lastName}`), e.id]));
    const nextReq = nextCode("IMP-", (await prisma.assetRequest.findMany({ select: { requestId: true } })).map((r) => r.requestId), 4);
    const STATUS = { "In stock": "Available", Allocated: "Allocated", "Under repair": "In Maintenance", Retired: "Retired", "In QC": "Available" };
    let astNew = 0, alloc = 0;
    for (const a of seed.assets) {
      const pur = purchaseBySerial.get(a.serial);
      const vendor = pur ? vendorByName.get(title(pur.vendor).toLowerCase()) : null;
      const model = title(a.model || pur?.model);
      const holder = a.empId ? seedEmp.get(a.empId) : null;
      const holderId = holder ? portalByName.get(normName(holder.name)) : null;
      let status = STATUS[a.status] ?? "Available";
      if (a.status === "Allocated" && !holderId) {
        note(`Asset ${a.tag}: holder "${holder?.name ?? a.empId}" not found among employees — imported as Available, check and assign`);
        status = "Available";
      }
      const data = {
        assetId: a.tag,
        officeTagNo: a.tag,
        assetName: (a.brand && model.toLowerCase().startsWith(a.brand.toLowerCase()) ? model : [a.brand, model].filter(Boolean).join(" ")) || a.category,
        category: a.category || "Laptop",
        type: a.itemType || a.category || "Laptop",
        condition: a.condition || "Good",
        status,
        purchaseDate: day(a.purchaseDate || pur?.date),
        purchaseCost: pur ? Number(pur.unitPrice) || null : null,
        vendor: pur ? title(pur.vendor) : null,
        vendorId: vendor?.id ?? null,
        remarks: [a.remarks, pur?.invoice ? `Invoice ${pur.invoice}` : ""].filter(Boolean).join(" · ") || null,
      };
      if (DRY) { astNew++; continue; }
      let inv = await prisma.assetInventory.findUnique({ where: { serialNumber: a.serial } });
      if (!inv) { astNew++; inv = await prisma.assetInventory.create({ data: { ...data, serialNumber: a.serial } }); }
      else inv = await prisma.assetInventory.update({ where: { id: inv.id }, data });
      if (status === "Allocated") {
        const open = await prisma.assetAllocation.findFirst({ where: { inventoryId: inv.id, returnedAt: null, status: "Allocated" } });
        if (!open) {
          const req = await prisma.assetRequest.create({
            data: {
              requestId: nextReq(), employeeId: holderId, assetType: data.type, assetCategory: data.category,
              title: `Imported from asset register: ${a.tag}`, status: "Allocated", approvedBy: actor.id, approvedAt: new Date(),
            },
          });
          await prisma.assetAllocation.create({
            data: {
              requestId: req.id, inventoryId: inv.id, employeeId: holderId, status: "Allocated",
              allocatedAt: day(a.allocatedOn) ?? new Date(), remarks: "Imported from ASA asset register",
            },
          });
          alloc++;
        }
      }
      const seen = await prisma.assetInventoryHistory.findFirst({ where: { inventoryId: inv.id, action: "Imported" } });
      if (!seen) await prisma.assetInventoryHistory.create({ data: { inventoryId: inv.id, action: "Imported", status, performedById: actor.id, remarks: "Loaded from ASA asset register (Excel)" } });
    }
    const unmatchedPurchases = seed.purchases.filter((p) => !seed.assets.some((a) => a.serial === p.serial)).length;
    if (unmatchedPurchases) note(`Asset purchases: ${unmatchedPurchases} purchase lines have no matching asset — kept for the upcoming Purchases feature, not imported`);
    console.log(`Assets: ${astNew} new, ${seed.assets.length - astNew} updated, ${alloc} allocations · Vendors: ${venNew} new`);
  }

  // ── 6. Timesheets (Zoho "Timesheets" export) ───────────────────────────────
  // Zoho exports two header rows and repeats column names, so columns are read by position.
  // Weekend / holiday placeholder rows (no client, 0 h) are skipped. Client/project/job combinations
  // that people logged time against but that were missing from the Projects/Jobs exports are created.
  if (args.timesheets) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(DIR, args.timesheets));
    const ws = wb.worksheets[0];
    const head = ws.getRow(1).values.slice(1).map(text);
    const col = (name, nth = 0) => head.reduce((acc, h, i) => (h === name ? [...acc, i] : acc), [])[nth];
    const C_ = {
      emp: col("Employee Id"), date: col("Date"), client: col("Client Name"), project: col("Project Name"), job: col("Job Name"),
      workItem: col("Work Item"), desc: col("Description", 1), billable: col("Billable Status"), hours: col("Logged Hours"),
      status: col("Approval Status"), approver: col("Approver"), approvedAt: col("Approval Time (Asia/Kolkata)"),
    };
    const hoursOf = (v) => {
      const m = text(v).match(/^(\d+):(\d{2})$/);
      return m ? +m[1] + +m[2] / 60 : Number(text(v)) || 0;
    };
    const rows = [];
    ws.eachRow((row, n) => {
      if (n <= 2) return;
      const v = row.values.slice(1);
      const hours = Math.round(hoursOf(v[C_.hours]) * 100) / 100;
      if (!title(v[C_.client]) || !title(v[C_.project]) || !title(v[C_.job]) || hours <= 0) return;
      rows.push({
        code: text(v[C_.emp]), date: day(v[C_.date]), client: title(v[C_.client]), project: title(v[C_.project]), job: title(v[C_.job]),
        workItem: title(v[C_.workItem]) || null, desc: title(v[C_.desc]), billable: !/non/i.test(text(v[C_.billable])), hours,
        status: text(v[C_.status]).toLowerCase(), approver: text(v[C_.approver]), approvedAt: v[C_.approvedAt],
      });
    });
    const skippedEmp = new Set();

    // Resolve (or create) client → project → job for every combination used
    const jobCache = new Map();
    let cliMade = 0, prjMade = 0, jobMade = 0;
    async function resolveJob(r) {
      const k = `${r.client}::${r.project}::${r.job}`.toLowerCase();
      if (jobCache.has(k)) return jobCache.get(k);
      let client = clientByName.get(r.client.toLowerCase()) || (DRY ? null : await prisma.client.findFirst({ where: { name: { equals: r.client, mode: "insensitive" } } }));
      if (!client) {
        cliMade++;
        client = DRY ? { id: `dry-${r.client}` } : await prisma.client.create({ data: { name: r.client, clientId: nextCli(), alias: r.client.slice(0, 12), gstStatus: "No", pan: "", status: "Active", createdBy: actor.id } });
        clientByName.set(r.client.toLowerCase(), client);
      }
      let proj = DRY ? null : await prisma.project.findFirst({ where: { clientId: client.id, name: { equals: r.project, mode: "insensitive" } }, include: { client: true } });
      if (!proj) {
        prjMade++;
        const used = rows.filter((x) => x.client === r.client && x.project === r.project);
        if (!DRY) {
          proj = await prisma.project.create({
            data: {
              name: r.project, projectId: nextPrj(), clientId: client.id, status: "Started", billable: used.some((x) => x.billable),
              startDate: used.map((x) => x.date).filter(Boolean).sort((a, b) => a - b)[0] ?? new Date(), createdBy: actor.id, createdByEmail: actor.officeEmail,
            },
            include: { client: true },
          });
          note(`Created from timesheets: project "${r.project}" (${r.client})`);
        }
      }
      let job = DRY ? null : await prisma.job.findFirst({ where: { projectId: proj.id, name: { equals: r.job, mode: "insensitive" } } });
      if (!job) {
        jobMade++;
        if (!DRY) {
          const jobId = nextJob();
          job = await prisma.job.create({
            data: {
              name: r.job, jobId, combinedId: `${proj.client.clientId}-${proj.projectId}-${jobId}`, projectId: proj.id, status: "Started",
              billable: rows.some((x) => x.client === r.client && x.project === r.project && x.job === r.job && x.billable),
              createdBy: actor.id, createdByEmail: actor.officeEmail,
            },
          });
        }
      }
      const out = DRY ? null : { job, proj };
      jobCache.set(k, out);
      return out;
    }

    const emps = new Map(
      (await prisma.employee.findMany({ where: { employeeId: { in: [...new Set(rows.map((r) => r.code))] } }, select: { id: true, employeeId: true, managerId: true, partnerId: true } }))
        .map((e) => [e.employeeId, e]),
    );
    const toInsert = [];
    const team = new Map(); // job/project → people who logged time (added to project/job teams)
    for (const r of rows) {
      const e = emps.get(r.code);
      if (!e) { skippedEmp.add(r.code); continue; }
      if (!r.date) continue;
      const res = await resolveJob(r);
      if (DRY) { toInsert.push(r); continue; }
      const approverCode = (r.approver.match(/^(\S+)\s/) || [])[1];
      const approvedBy = r.status === "approved" ? (approverCode && byCode.get(approverCode)) || null : null;
      toInsert.push({
        employeeId: e.id, jobId: res.job.id, projectId: res.proj.id, clientId: res.proj.clientId, combinedJobCode: res.job.combinedId,
        hours: r.hours, description: r.desc || r.workItem || "", workItem: r.workItem, date: r.date,
        weekStart: (() => { const d = new Date(r.date); const w = d.getUTCDay(); d.setUTCDate(d.getUTCDate() + (w === 0 ? -6 : 1 - w)); return d; })(),
        billableStatus: r.billable ? "billable" : "non_billable",
        submissionStatus: r.status === "approved" ? "approved" : "submitted",
        submittedAt: r.date,
        approvedAt: r.status === "approved" ? day(r.approvedAt) ?? r.date : null,
        approvedBy,
        reportingManagerId: e.managerId, reportingPartnerId: e.partnerId,
      });
      if (!team.has(res.job.id)) team.set(res.job.id, { projectId: res.proj.id, people: new Set() });
      team.get(res.job.id).people.add(e.id);
    }

    // Idempotent: for each identical entry signature, only insert what's not already there.
    let inserted = 0, already = 0;
    if (!DRY) {
      const sig = (t) => `${t.employeeId}|${t.jobId}|${new Date(t.date).toISOString().slice(0, 10)}|${t.hours}|${t.description}`;
      const range = toInsert.map((t) => t.date.getTime());
      const existing = await prisma.timelog.findMany({
        where: { employeeId: { in: [...new Set(toInsert.map((t) => t.employeeId))] }, date: { gte: new Date(Math.min(...range)), lte: new Date(Math.max(...range) + 86_399_999) } },
        select: { employeeId: true, jobId: true, date: true, hours: true, description: true },
      });
      const have = new Map();
      for (const t of existing) have.set(sig(t), (have.get(sig(t)) ?? 0) + 1);
      const batch = [];
      for (const t of toInsert) {
        const k = sig(t);
        if (have.get(k)) { have.set(k, have.get(k) - 1); already++; continue; }
        batch.push(t);
      }
      for (let i = 0; i < batch.length; i += 500) await prisma.timelog.createMany({ data: batch.slice(i, i + 500) });
      inserted = batch.length;
      for (const [jobId, v] of team) {
        await prisma.jobUser.createMany({ data: [...v.people].map((employeeId) => ({ jobId, employeeId })), skipDuplicates: true });
        await prisma.projectUser.createMany({ data: [...v.people].map((employeeId) => ({ projectId: v.projectId, employeeId })), skipDuplicates: true });
      }
    }
    if (skippedEmp.size) note(`Timesheet rows skipped — employee not in employee export: ${[...skippedEmp].join(", ")}`);
    const hrs = toInsert.reduce((s, t) => s + t.hours, 0);
    console.log(`Timesheets: ${toInsert.length} entries (${Math.round(hrs)} h) → ${DRY ? "would insert" : `${inserted} inserted, ${already} already present`} · created ${cliMade} clients, ${prjMade} projects, ${jobMade} jobs`);
  }

  console.log(`\nNotes (${report.length}):`);
  report.forEach((r) => console.log("  - " + r));
}

main()
  .catch((e) => { console.error("IMPORT FAILED:", e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
