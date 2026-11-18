import { fileURLToPath as __toPath } from "url";
const __ROOT = __toPath(new URL("../../", import.meta.url)).split(String.fromCharCode(92)).join("/").replace(/\/$/, "");
// Smoke test: export, template, weekly save, period lock, project team, help desk. Test accounts only.
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(__ROOT + "/_local/test-accounts.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const B = "http://127.0.0.1:5000";
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const login = async (w) => { const j = await (await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: env[w + "_EMAIL"], password: env.TEST_PASSWORD }) })).json(); return { t: j.token, id: j.user?.id }; };
const call = async (t, m, p, b) => { const r = await fetch(B + p, { method: m, headers: { authorization: "Bearer " + t, ...(b ? { "content-type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = null; const ct = r.headers.get("content-type") ?? ""; if (ct.includes("json")) j = await r.json(); else j = { ct, len: (await r.arrayBuffer()).byteLength }; return [r.status, j]; };

const A = await login("ADMIN"), E = await login("EMPLOYEE"), I = await login("IT"), M = await login("MANAGER");

let [s, j] = await call(E.t, "GET", "/api/timelogs/export?dateFrom=2026-01-01&dateTo=2026-12-31");
check("Export returns an xlsx", s === 200 && j.ct.includes("spreadsheet"), `${s} ${j.ct}`);
[s, j] = await call(E.t, "GET", "/api/timelogs/export?scope=org");
check("Employee can't export the organization", s === 403);
[s, j] = await call(E.t, "GET", "/api/timelogs/template");
check("Template is a real xlsx", s === 200 && j.ct.includes("spreadsheet"));

const jobs = (await call(E.t, "GET", "/api/jobs"))[1].data;
const job = jobs.find((x) => ["started", "active"].includes(String(x.status).toLowerCase()));
const week = "2026-10-05";
[s, j] = await call(E.t, "PUT", "/api/timelogs/week", { weekStart: week, rows: [{ jobId: job.id, hours: { "2026-10-06": 3, "2026-10-07": 2.5 } }] });
check("Weekly grid saves", s === 200 && j.data.changed === 2, JSON.stringify(j));
[s, j] = await call(E.t, "PUT", "/api/timelogs/week", { weekStart: week, rows: [{ jobId: job.id, hours: { "2026-10-06": 25 } }] });
check("Weekly grid refuses >24 h", s === 400, j.message);
[s, j] = await call(A.t, "POST", "/api/timesheet-lock", { lockedThrough: "2026-10-06" });
check("Admin locks through 6 Oct", s === 200, j.message);
[s, j] = await call(E.t, "PUT", "/api/timelogs/week", { weekStart: week, rows: [{ jobId: job.id, hours: { "2026-10-06": 4, "2026-10-07": 2.5 } }] });
check("Locked day can't be changed", s === 400 && /locked/.test(j.message), j.message);
[s] = await call(E.t, "POST", "/api/timesheet-lock", { lockedThrough: "2026-10-01" });
check("Employee can't change the lock", s === 403);
[s, j] = await call(A.t, "POST", "/api/timesheet-lock", { lockedThrough: null, note: "smoke test reopen" });
check("Admin reopens", s === 200 && j.data.lockedThrough === null, JSON.stringify(j.data));
[s, j] = await call(E.t, "PUT", "/api/timelogs/week", { weekStart: week, rows: [{ jobId: job.id, hours: { "2026-10-06": 0, "2026-10-07": 0 } }] });
check("Clearing cells removes drafts", s === 200 && j.data.changed === 2, JSON.stringify(j));

// Project team
const projects = (await call(A.t, "GET", "/api/projects"))[1].data;
const p = projects[0];
const before = (p.users ?? []).map((u) => u.employee.id);
[s, j] = await call(A.t, "PUT", `/api/projects/${p.id}`, { assignedEmployees: [...new Set([...before, E.id])] });
check("Project team saves", s === 200 && j.data.users.some((u) => u.employee.id === E.id));
await call(A.t, "PUT", `/api/projects/${p.id}`, { assignedEmployees: before });

// Partners lookup
[s, j] = await call(E.t, "GET", "/api/employees/partners");
check("Partners list loads", s === 200 && Array.isArray(j.data), `${j.data?.length} partners`);

// Help desk: agent assigns on create, name is returned, assignee notified
const fd = new FormData(); fd.append("title", "Smoke test ticket"); fd.append("description", "smoke"); fd.append("assignedTo", I.id);
let r = await fetch(B + "/api/tickets", { method: "POST", headers: { authorization: "Bearer " + A.t }, body: fd }); j = await r.json();
check("Agent-assigned ticket keeps its assignee", r.status === 201 && j.data.assignedTo === I.id && !!j.data.assigneeName, j.data?.assigneeName);
check("Ticket carries SLA due time", !!j.data.slaDueAt && j.data.slaHours > 0);
const tid = j.data.id;
[s, j] = await call(I.t, "PATCH", `/api/tickets/${tid}`, { assignedTo: E.id });
check("Can't assign a ticket to a non-agent", s === 400);
[s, j] = await call(I.t, "PATCH", `/api/tickets/${tid}`, { status: "Resolved" });
check("Resolved ticket reports SLA met", s === 200 && j.data.slaMet === true, String(j.data?.slaMet));
await call(A.t, "DELETE", `/api/tickets/${tid}`);

console.log(`\n${pass} passed, ${fail} failed`);
