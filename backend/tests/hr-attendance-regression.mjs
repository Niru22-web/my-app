import { fileURLToPath as __toPath } from "url";
const __ROOT = __toPath(new URL("../../", import.meta.url)).split(String.fromCharCode(92)).join("/").replace(/\/$/, "");
// Attendance corrections, exits, document checklist. Test accounts only; cleans up.
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(__ROOT + "/_local/test-accounts.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const B = "http://127.0.0.1:5000";
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const login = async (w) => { const j = await (await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: env[w + "_EMAIL"], password: env.TEST_PASSWORD }) })).json(); return { t: j.token, id: j.user?.id }; };
const call = async (t, m, p, b) => { const r = await fetch(B + p, { method: m, headers: { authorization: "Bearer " + t, ...(b ? { "content-type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch {} return [r.status, j]; };
const H = await login("HR"), M = await login("MANAGER"), E = await login("EMPLOYEE"), I = await login("IT");

// pick a recent working day (Mon-Fri) within 7 days, not today
let d = new Date(Date.now() + 330 * 60000); let day;
for (let i = 1; i <= 7; i++) { const x = new Date(d.getTime() - i * 86400000); if (x.getUTCDay() >= 1 && x.getUTCDay() <= 5) { day = x.toISOString().slice(0, 10); break; } }
// Most recent day a correction is allowed (skips weekly offs and firm holidays).
let s, j;
for (let i = 1; i <= 7; i++) {
  const x = new Date(d.getTime() - i * 86400000).toISOString().slice(0, 10);
  [s, j] = await call(E.t, "POST", "/api/attendance/requests", { date: x, checkIn: "11:05", checkOut: "20:10", reason: "Smoke test — forgot to punch" });
  if (s < 300) { day = x; break; }
}
check("Employee raises a correction", s === 200 || s === 201, j?.message);
const team = (await call(M.t, "GET", "/api/attendance/requests?scope=team"))[1]?.data ?? [];
const row = team.find((r) => r.date === day && r.employee?.id === E.id && r.status === "PENDING");
check("Manager sees it and can decide", !!row?.canDecide, String(row?.canDecide));
const [s2] = await call(E.t, "POST", `/api/attendance/requests/${row?.id}/approve`, {});
check("Employee can't approve own request", s2 === 403, String(s2));
[s, j] = await call(M.t, "POST", `/api/attendance/requests/${row?.id}/reject`, { remarks: "smoke test cleanup" });
check("Manager rejects with a reason", s === 200, j?.message);
[s, j] = await call(E.t, "GET", "/api/attendance/policy");
check("Attendance rules readable", s === 200 && j.data.graceMinutes >= 0, JSON.stringify(j?.data));
[s] = await call(E.t, "PUT", "/api/attendance/policy", { graceMinutes: 999 });
check("Employee can't change rules", s === 403);

[s, j] = await call(H.t, "GET", "/api/exits?status=ALL");
check("HR lists exits", s === 200 && Array.isArray(j.data), `${j?.data?.length} exits`);
[s, j] = await call(H.t, "POST", "/api/exits", { employeeId: E.id, exitType: "Resignation", resignationDate: day, lastWorkingDay: "2026-12-31", reason: "smoke test" });
const ex = j?.data;
check("HR starts an exit with a checklist", s < 300 && ex?.tasks?.length >= 5, `${ex?.tasks?.length} tasks`);
const itTask = ex?.tasks?.find((t) => t.team === "IT");
const hrTask = ex?.tasks?.find((t) => t.team === "HR");
[s] = await call(I.t, "PATCH", `/api/exits/${ex?.id}/tasks/${hrTask?.id}`, { done: true });
check("IT can't tick an HR task", s === 403, String(s));
[s] = await call(I.t, "PATCH", `/api/exits/${ex?.id}/tasks/${itTask?.id}`, { done: true });
check("IT ticks its own task", s === 200, String(s));
[s, j] = await call(H.t, "POST", `/api/exits/${ex?.id}/complete`);
check("Can't complete before the last day / open tasks", s >= 400 && s < 500, j?.message);
[s] = await call(H.t, "POST", `/api/exits/${ex?.id}/cancel`, { reason: "smoke test cleanup" });
check("Exit cancelled (employee stays active)", s === 200);
const me = (await call(E.t, "GET", "/api/auth/me"))[0];
check("Employee still signed in and active", me === 200);

[s, j] = await call(H.t, "GET", "/api/hr/document-checklist/summary");
check("Document summary loads", s === 200 && Array.isArray(j.data?.rows), `${j?.data?.rows?.length} people, ${j?.data?.requirements} requirements`);
[s, j] = await call(E.t, "GET", `/api/hr/document-checklist?employeeId=${E.id}`);
check("Employee sees own checklist (read-only)", s === 200 && j.data.canVerify === false, `${j?.data?.items?.length} items`);
[s] = await call(E.t, "GET", "/api/hr/document-checklist/summary");
check("Employee can't see the firm summary", s === 403);
console.log(`\n${pass} passed, ${fail} failed`);
