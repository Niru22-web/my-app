// Run with the API running locally:  node backend/tests/timesheet-ui-regression.mjs
// Covers the Time logs upgrade: PUT /api/timelogs/grid (+ /week refactor), GET /api/timelogs/my-jobs and /my-projects.
// Test accounts only (_local/test-accounts.env); every entry it creates is deleted at the end. Never prints secrets.
import fs from "fs";

const env = Object.fromEntries(
  fs
    .readFileSync("C:/Users/SHIVA/Downloads/WebApp/_local/test-accounts.env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const B = "http://127.0.0.1:5000";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const login = async (who) => {
  const r = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: env[who + "_EMAIL"], password: env.TEST_PASSWORD }) });
  const j = await r.json();
  if (!j.token) throw new Error(`Login failed for ${who} (${r.status})`);
  return { t: j.token, id: j.user?.id };
};
const call = async (t, m, p, b) => {
  const r = await fetch(B + p, { method: m, headers: { ...(t ? { authorization: "Bearer " + t } : {}), ...(b ? { "content-type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined });
  let j = null;
  try { j = await r.json(); } catch { /* not json */ }
  return [r.status, j];
};
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => ymd(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000));
const monday = (s) => { const d = new Date(`${s}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; return addDays(s, -dow); };

// One login per role (login is rate-limited per email).
const E = await login("EMPLOYEE"), M = await login("MANAGER"), A = await login("ADMIN");

const created = new Set();
const myLogs = async (t, from, to) => (await call(t, "GET", `/api/timelogs/my?dateFrom=${from}&dateTo=${to}`))[1].data ?? [];
const track = async (from, to) => { for (const e of await myLogs(E.t, from, to)) if (!before.has(e.id)) created.add(e.id); };

// ---- Setup: an open job and a clean week after any lock ---------------------------------
const jobs = (await call(E.t, "GET", "/api/jobs"))[1].data ?? [];
const openJobs = jobs.filter((x) => ["started", "active"].includes(String(x.status).toLowerCase()));
const job = openJobs[0], job2 = openJobs[1];
const closedJob = jobs.find((x) => !["started", "active"].includes(String(x.status).toLowerCase()));
const lockInfo = (await call(E.t, "GET", "/api/timelogs/lock"))[1].data ?? {};
const prevLock = lockInfo.lockedThrough ?? null;
const istToday = ymd(new Date(Date.now() + 330 * 60_000));

let week = null;
for (let i = 2; i < 20 && !week; i++) {
  const ws = addDays(monday(istToday), -7 * i);
  if (prevLock && ws <= prevLock) break;
  if (!(await myLogs(E.t, ws, addDays(ws, 13))).length) week = ws;
}
check("Setup: open job and a free week found", !!job && !!job2 && !!week, `${week}`);
if (!job || !job2 || !week) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }
const d = (i) => addDays(week, i);
const before = new Set((await myLogs(E.t, d(0), d(30))).map((e) => e.id));

try {
  // ---- PUT /api/timelogs/grid -------------------------------------------------------------
  let [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: d(0), to: d(13), rows: [{ jobId: job.id, description: "Grid regression test entry", hours: { [d(1)]: 2.5, [d(9)]: 1.25 } }] });
  check("Grid saves cells across two weeks", s === 200 && j.data?.changed === 2, JSON.stringify(j));
  await track(d(0), d(13));
  let logs = await myLogs(E.t, d(0), d(13));
  const c1 = logs.find((e) => e.jobId === job.id && e.date.slice(0, 10) === d(1));
  check("Grid cell becomes a draft with the description", c1 && c1.hours === 2.5 && c1.submissionStatus === "not_submitted" && c1.description === "Grid regression test entry");

  [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: d(0), to: d(13), rows: [{ jobId: job.id, hours: { [d(1)]: 3, [d(9)]: 1.25 } }] });
  check("Grid replaces the draft in a cell (one change)", s === 200 && j.data?.changed === 1, JSON.stringify(j));
  logs = await myLogs(E.t, d(0), d(13));
  check("Replaced cell has the new hours, no duplicate", logs.filter((e) => e.jobId === job.id && e.date.slice(0, 10) === d(1)).map((e) => e.hours).join() === "3");

  [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: d(0), to: d(6), rows: [{ jobId: job.id, hours: { [d(1)]: 20 } }, { jobId: job2.id, hours: { [d(1)]: 5 } }] });
  check("Grid refuses a day over 24 h", s === 400 && /24/.test(j.message), j.message);
  [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: d(0), to: d(6), rows: [{ jobId: job.id, hours: { [d(2)]: 0.1 } }] });
  check("Grid refuses less than 0.25 h", s === 400, j.message);
  [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: d(0), to: d(31), rows: [] });
  check("Grid refuses more than 31 days", s === 400 && /31/.test(j.message), j.message);
  [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: d(6), to: d(0), rows: [] });
  check("Grid refuses end before start", s === 400, j.message);
  [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: d(0), to: d(6), rows: [{ jobId: job.id, hours: { [d(8)]: 2 } }] });
  check("Grid refuses a day outside the period", s === 400 && /outside/.test(j.message), j.message);
  [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: d(0), to: d(6), rows: [{ jobId: job.id, hours: { [d(2)]: 1 } }, { jobId: job.id, hours: { [d(3)]: 1 } }] });
  check("Grid refuses the same job twice", s === 400 && /more than once/.test(j.message), j.message);
  [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: "2026-13-01", to: d(6), rows: [] });
  check("Grid refuses a bad date", s === 400, j?.message);
  const far = addDays(istToday, 10);
  [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: far, to: far, rows: [{ jobId: job.id, hours: { [far]: 1 } }] });
  check("Grid refuses more than 7 days ahead", s === 400 && /7 days/.test(j.message), j.message);
  if (closedJob) {
    [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: d(0), to: d(6), rows: [{ jobId: closedJob.id, hours: { [d(2)]: 1 } }] });
    check("Grid refuses a job that isn't Active/Started", s === 400 && /can't be added/.test(j.message), j.message);
  } else check("Grid refuses a closed job (skipped: no closed job in data)", true);
  [s, j] = await call(null, "PUT", "/api/timelogs/grid", { from: d(0), to: d(0), rows: [] });
  check("Grid needs a login", s === 401);

  // Append mode (daily log): adds entries, never replaces.
  [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: d(1), to: d(1), mode: "append", rows: [{ jobId: job.id, description: "Daily log row one", workItem: "WI-1", hours: { [d(1)]: 1 } }, { jobId: job.id, description: "Daily log row two", hours: { [d(1)]: 0.5 } }] });
  check("Daily log (append) adds two entries", s === 200 && j.data?.changed === 2, JSON.stringify(j));
  await track(d(0), d(13));
  logs = await myLogs(E.t, d(1), d(1));
  check("Day now has three entries for the job (3 + 1 + 0.5)", logs.filter((e) => e.jobId === job.id).map((e) => e.hours).sort().join() === "0.5,1,3", logs.map((e) => e.hours).join());
  check("Append keeps the work item", logs.some((e) => e.workItem === "WI-1"));
  [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: d(1), to: d(1), mode: "append", rows: [{ jobId: job2.id, hours: { [d(1)]: 20 } }] });
  check("Append counts existing time toward 24 h", s === 400 && /24/.test(j.message), j.message);
  [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: d(1), to: d(1), mode: "sideways", rows: [] });
  check("Grid refuses an unknown mode", s === 400);

  // Submitted time is never touched by the grid.
  const toSubmit = logs.find((e) => e.description === "Daily log row two");
  [s] = await call(E.t, "PATCH", `/api/timelogs/${toSubmit.id}/submit`);
  check("Submit one entry", s === 200);
  [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: d(0), to: d(6), rows: [{ jobId: job.id, hours: { [d(1)]: 0 } }] });
  check("Clearing a cell removes only drafts", s === 200 && j.data?.changed === 1, JSON.stringify(j));
  logs = await myLogs(E.t, d(1), d(1));
  check("Submitted entry is still there and still submitted", logs.length === 1 && logs[0].id === toSubmit.id && logs[0].submissionStatus === "submitted", logs.map((e) => `${e.hours}/${e.submissionStatus}`).join());

  // Period lock applies to grids.
  [s] = await call(A.t, "POST", "/api/timesheet-lock", { lockedThrough: d(9) });
  check("Admin locks through the test week", s === 200);
  [s, j] = await call(E.t, "PUT", "/api/timelogs/grid", { from: d(7), to: d(13), rows: [{ jobId: job.id, hours: { [d(9)]: 4 } }] });
  check("Locked day can't be changed through the grid", s === 400 && /locked/.test(j.message), j.message);
  [s] = await call(A.t, "POST", "/api/timesheet-lock", { lockedThrough: prevLock, note: "timesheet-ui regression: restore previous lock" });
  check("Lock restored", s === 200);

  // /week still works (now shares the grid code).
  [s, j] = await call(E.t, "PUT", "/api/timelogs/week", { weekStart: d(9), rows: [{ jobId: job2.id, hours: { [d(10)]: 2 } }] });
  check("Weekly save (mid-week weekStart → Monday) still works", s === 200 && j.data?.changed === 1, JSON.stringify(j));
  await track(d(0), d(13));
  [s, j] = await call(E.t, "PUT", "/api/timelogs/week", { weekStart: d(7), rows: [{ jobId: job2.id, hours: { [d(10)]: 25 } }] });
  check("Weekly save still refuses > 24 h", s === 400, j.message);

  // ---- GET /api/timelogs/my-jobs -------------------------------------------------------
  [s, j] = await call(E.t, "GET", "/api/timelogs/my-jobs");
  const ej = j?.data ?? [];
  const keys = ["id", "jobId", "name", "status", "billable", "canLog", "assigned", "project", "client", "myHoursMonth", "myHoursTotal", "myBillableHours", "teamHours", "usersCount"];
  check("my-jobs returns a list", s === 200 && Array.isArray(ej) && /^\d{4}-\d{2}$/.test(j.month), `${ej.length} jobs`);
  check("my-jobs rows have the expected fields", ej.every((r) => keys.every((k) => k in r) && r.project?.name && r.client?.name));
  const mine1 = ej.find((r) => r.id === job.id), mine2 = ej.find((r) => r.id === job2.id);
  check("my-jobs includes jobs I logged on", !!mine1 && !!mine2);
  check("my-jobs: my hours include the test time", mine2 && mine2.myHoursTotal >= 2 && mine1.myHoursTotal >= 1.25, `${mine2?.myHoursTotal} / ${mine1?.myHoursTotal}`);
  check("my-jobs: team hours ≥ my hours", ej.every((r) => r.teamHours + 1e-6 >= r.myHoursTotal && r.myHoursTotal + 1e-6 >= r.myBillableHours));
  check("my-jobs only lists jobs I'm assigned to or logged on", ej.every((r) => r.assigned || r.myHoursTotal > 0));
  const [, mj] = await call(M.t, "GET", "/api/timelogs/my-jobs");
  const allMine = (await myLogs(M.t, "2020-01-01", addDays(istToday, 7))).filter((e) => e.jobId === job2.id).reduce((x, e) => x + e.hours, 0);
  const mRow = (mj?.data ?? []).find((r) => r.id === job2.id);
  check("Another person's my-jobs shows only their own hours", !mRow || Math.abs(mRow.myHoursTotal - allMine) < 0.01, `${mRow?.myHoursTotal} vs ${allMine}`);
  check("Manager's my-jobs also lists only their own assigned/logged jobs", (mj?.data ?? []).every((r) => r.assigned || r.myHoursTotal > 0), `${mj?.data?.length} jobs`);
  [s] = await call(null, "GET", "/api/timelogs/my-jobs");
  check("my-jobs needs a login", s === 401);

  // ---- GET /api/timelogs/my-projects ----------------------------------------------------
  [s, j] = await call(E.t, "GET", "/api/timelogs/my-projects");
  const ep = j?.data ?? [];
  const pkeys = ["id", "projectId", "name", "status", "client", "jobsCount", "openJobsCount", "usersCount", "myHoursMonth", "myHoursTotal", "teamHours", "member"];
  check("my-projects returns a list with the expected fields", s === 200 && ep.every((r) => pkeys.every((k) => k in r)), `${ep.length} projects`);
  check("my-projects includes the test job's project", ep.some((r) => r.id === job.projectId));
  check("my-projects: team hours ≥ my hours, open jobs ≤ jobs", ep.every((r) => r.teamHours + 1e-6 >= r.myHoursTotal && r.openJobsCount <= r.jobsCount));
  const sumJobs = ej.filter((r) => r.project.id === job.projectId).reduce((x, r) => x + r.myHoursTotal, 0);
  const pRow = ep.find((r) => r.id === job.projectId);
  check("my-projects hours match the jobs in it", pRow && Math.abs(pRow.myHoursTotal - sumJobs) < 0.01, `${pRow?.myHoursTotal} vs ${sumJobs}`);
  [s] = await call(null, "GET", "/api/timelogs/my-projects");
  check("my-projects needs a login", s === 401);
} finally {
  // ---- Cleanup: only what this run created ------------------------------------------------
  await track(d(0), d(30));
  let removed = 0;
  for (const id of created) {
    const [s] = await call(E.t, "DELETE", `/api/timelogs/${id}`);
    if (s === 200) removed++;
    else if ((await call(A.t, "DELETE", `/api/timelogs/${id}`))[0] === 200) removed++;
  }
  const left = (await myLogs(E.t, d(0), d(30))).filter((e) => !before.has(e.id));
  check("Cleanup removed every test entry", left.length === 0, `${removed} removed`);
  const lockNow = (await call(E.t, "GET", "/api/timelogs/lock"))[1].data?.lockedThrough ?? null;
  if (lockNow !== prevLock) await call(A.t, "POST", "/api/timesheet-lock", { lockedThrough: prevLock, note: "timesheet-ui regression: restore previous lock" });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
