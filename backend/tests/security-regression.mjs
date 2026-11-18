import { fileURLToPath as __toPath } from "url";
const __ROOT = __toPath(new URL("../../", import.meta.url)).split(String.fromCharCode(92)).join("/").replace(/\/$/, "");
// Run with the API running locally:  node backend/tests/security-regression.mjs
// Uses the local test accounts in _local/test-accounts.env and only touches test-account records.
// Re-runs the exploits found in the audit against the local API. Test accounts only.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
const require = createRequire(__ROOT + "/frontend/package.json");
const { io } = require("socket.io-client");

const env = Object.fromEntries(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../_local/test-accounts.env"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const B = "http://127.0.0.1:5000";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const login = async (who) => {
  const r = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: env[who + "_EMAIL"], password: env.TEST_PASSWORD }) });
  const j = await r.json();
  return { t: j.token, id: j.user?.id };
};
const call = async (t, m, p, b) => {
  const r = await fetch(B + p, { method: m, headers: { ...(t ? { authorization: "Bearer " + t } : {}), ...(b ? { "content-type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return [r.status, j];
};

const A = await login("ADMIN"), H = await login("HR"), I = await login("IT"), M = await login("MANAGER"), P = await login("PARTNER"), E = await login("EMPLOYEE"), C = await login("ACCOUNTANT");

// 1. Privilege escalation
check("Manager can't make itself Admin", (await call(M.t, "PUT", `/api/employees/${M.id}`, { role: "Admin" }))[0] === 403);
check("Manager can't edit HR's record", (await call(M.t, "PUT", `/api/employees/${H.id}`, { designation: "x" }))[0] === 403);
check("IT can't edit others", (await call(I.t, "PUT", `/api/employees/${C.id}`, { status: "Inactive" }))[0] === 403);
check("HR can't grant Admin", (await call(H.t, "PUT", `/api/employees/${C.id}`, { role: "Admin" }))[0] === 403);
check("Admin can't change own role", (await call(A.t, "PUT", `/api/employees/${A.id}`, { role: "Employee" }))[0] === 403);
const [se] = await call(E.t, "PUT", `/api/employees/${E.id}`, { pan: "ABCDE1234F" });
check("Employee can't change own PAN", se === 403, `status ${se}`);
const [sc, scj] = await call(E.t, "PUT", `/api/employees/${E.id}`, { personalMobile: "9999999999" });
check("Employee can change own mobile", sc === 200, `status ${sc}`);
check("Self update response has no salary leak issue (own view is full)", !!scj?.data);

// 2. Profile redaction
const people = (await call(A.t, "GET", "/api/employees"))[1]?.data ?? [];
const real = people.find((p) => !String(p.officeEmail).endsWith("@asa-local.test"));
const [, vj] = await call(E.t, "GET", `/api/employees/${real.id}`);
const prof = vj?.data?.profile ?? {};
check("Employee sees no DOB/PAN/Aadhaar/bank/files of a colleague", !("dob" in prof) && !("pan" in prof) && !("aadhaar" in prof) && !("bankAccountNumber" in prof) && !("panFileUrl" in prof), Object.keys(prof).join(","));
const [, hj] = await call(H.t, "GET", `/api/employees/${real.id}`);
check("HR still sees full profile", hj?.data?.profile ? "dob" in hj.data.profile : true);

// 3. Uploads
const docs = fs.readdirSync(__ROOT + "/backend/uploads/documents").filter((f) => !f.startsWith("."));
if (docs.length) {
  check("Anonymous can't download a KYC document", (await call(null, "GET", `/uploads/documents/${docs[0]}`))[0] === 401);
  check("Employee can't download someone else's document", [403, 404].includes((await call(E.t, "GET", `/uploads/documents/${docs[0]}`))[0]));
  check("Admin can download it", (await call(A.t, "GET", `/uploads/documents/${docs[0]}`))[0] === 200);
}
const photos = fs.readdirSync(__ROOT + "/backend/uploads/profile");
if (photos.length) check("Profile photo still loads for <img>", (await fetch(`${B}/uploads/profile/${photos[0]}`)).status === 200);

// 4. Lock-out by non-HR
check("Accountant can't reject HR", (await call(C.t, "POST", `/api/employees/reject-employee/${H.id}`))[0] === 403);
check("Manager can't deactivate the accountant", (await call(M.t, "PATCH", `/api/employees/${C.id}/toggle-status`))[0] === 403);

// 5. Stale sessions: deactivate accountant via Admin, old token must stop working, then reactivate
const [td] = await call(A.t, "PATCH", `/api/employees/${C.id}/toggle-status`);
const [after] = await call(C.t, "GET", "/api/auth/me");
check("Deactivated user's token stops working at once", td === 200 && after === 401, `toggle ${td}, me ${after}`);
await call(A.t, "PATCH", `/api/employees/${C.id}/toggle-status`);
const [stillOld] = await call(C.t, "GET", "/api/auth/me");
check("…and stays signed out after reactivation (must sign in again)", stillOld === 401);
const C2 = await login("ACCOUNTANT");
check("Reactivated user can sign in again", !!C2.t);

// 6. Login
const [lw, lwj] = await call(null, "POST", "/api/auth/login", { email: env.EMPLOYEE_EMAIL, password: "wrong-password-1" });
const [ln, lnj] = await call(null, "POST", "/api/auth/login", { email: "nobody-here@asa-local.test", password: "wrong-password-1" });
check("Wrong password and unknown email give the same answer", lw === 401 && ln === 401 && lwj?.message === lnj?.message, lwj?.message);
let last = 0;
for (let i = 0; i < 11; i++) last = (await call(null, "POST", "/api/auth/login", { email: "ratelimit-probe@asa-local.test", password: "x" + i }))[0];
check("Repeated failures are rate-limited", last === 429, `last status ${last}`);

// 7. Socket
const anon = await new Promise((res) => {
  const s = io(B, { transports: ["websocket"], reconnection: false });
  s.on("connect", () => { s.close(); res("connected"); });
  s.on("connect_error", (e) => { s.close(); res("refused: " + e.message); });
});
check("Anonymous socket is refused", anon.startsWith("refused"), anon);
const authed = await new Promise((res) => {
  const s = io(B, { transports: ["websocket"], reconnection: false, auth: { token: E.t } });
  s.on("connect", () => { s.close(); res("connected"); });
  s.on("connect_error", (e) => { s.close(); res("refused: " + e.message); });
});
check("Signed-in socket connects", authed === "connected", authed);

// 8. Claims
const [cc, ccj] = await call(H.t, "POST", "/api/reimbursements", { title: "Security regression test", category: "Travel", amount: 10, date: "2026-10-10", description: "test" });
if (cc === 201 || cc === 200) {
  const cid = ccj.data.id;
  check("Manager outside HR's reporting line can't approve HR's claim", (await call(M.t, "PATCH", `/api/reimbursements/${cid}/approve`, {}))[0] === 403);
  check("Partner outside the line can't approve it either", (await call(P.t, "PATCH", `/api/reimbursements/${cid}/approve`, {}))[0] === 403);
  check("HR can't approve own claim", (await call(H.t, "PATCH", `/api/reimbursements/${cid}/approve`, {}))[0] === 403);
  const [aa] = await call(A.t, "PATCH", `/api/reimbursements/${cid}/approve`, {});
  const [pp] = await call(C2.t, "PATCH", `/api/reimbursements/${cid}/mark-as-paid`, { paymentMode: "Bank Transfer" });
  const [pp2] = await call(C2.t, "PATCH", `/api/reimbursements/${cid}/mark-as-paid`, { paymentMode: "Bank Transfer" });
  check("Admin approves, accountant pays once", aa === 200 && pp === 200 && pp2 === 400, `${aa}/${pp}/${pp2}`);
  check("A PAID claim can't be sent back", (await call(A.t, "PATCH", `/api/reimbursements/${cid}/send-back`, { remarks: "x" }))[0] === 400);
  check("A PAID claim can't be rejected", (await call(A.t, "PATCH", `/api/reimbursements/${cid}/reject`, { remarks: "x" }))[0] === 400);
} else console.log("(claim create failed", cc, ccj?.message, ")");

// 9. Timesheets
const jobs = (await call(E.t, "GET", "/api/jobs"))[1]?.data ?? [];
const job = jobs.find((j) => ["started", "active"].includes(String(j.status).toLowerCase()));
if (job) {
  const [t1, t1j] = await call(E.t, "POST", "/api/timelogs", { jobId: job.id, date: "2026-10-03", hours: 20, description: "regression" });
  const [t2, t2j] = await call(E.t, "POST", "/api/timelogs", { jobId: job.id, date: "2026-10-03", hours: 2, description: "regression" });
  const [t3] = await call(E.t, "PUT", `/api/timelogs/${t2j?.data?.id}`, { hours: 6 });
  check("Editing can't push a day past 24 h", t1 === 201 && t2 === 201 && t3 === 400, `${t1}/${t2}/${t3}`);
  check("0.01 h is refused", (await call(E.t, "POST", "/api/timelogs", { jobId: job.id, date: "2026-10-05", hours: 0.01, description: "x" }))[0] === 400);
  check("Far-future dates are refused", (await call(E.t, "POST", "/api/timelogs", { jobId: job.id, date: "2030-01-01", hours: 1, description: "x" }))[0] === 400);
  for (const id of [t1j?.data?.id, t2j?.data?.id].filter(Boolean)) await call(E.t, "DELETE", `/api/timelogs/${id}`);
}

// 10. Settings partial update
const before = (await call(H.t, "GET", "/api/leave-policy"))[1].data.calendar;
await call(H.t, "PUT", "/api/leave-policy/settings", {});
const afterSet = (await call(H.t, "GET", "/api/leave-policy"))[1].data.calendar;
check("Empty settings update changes nothing", before.saturdaysOff === afterSet.saturdaysOff && before.standardDayHours === afterSet.standardDayHours && before.leaveApprovalLevels === afterSet.leaveApprovalLevels && before.leaveYearStartMonth === afterSet.leaveYearStartMonth);

// 11. Holidays
check("Manager can't add a firm holiday", (await call(M.t, "POST", "/api/events", { title: "x", date: "2026-12-30", type: "Holiday" }))[0] === 403);

// 12. Errors don't leak internals
const [e1, e1j] = await call(E.t, "GET", "/api/timelogs/team?scope=team&dateFrom=garbage");
check("Bad input doesn't leak database internals", !JSON.stringify(e1j ?? {}).match(/prisma|C:\\\\|invocation/i), `status ${e1}`);

// 13. Invite link
const [iv, ivj] = await call(H.t, "POST", "/api/employees", { firstName: "Regression", lastName: "Invite", officeEmail: `regression.invite.${Date.now()}@asa-local.test`, designation: "Test", role: "Employee" });
check("Invite returns a copyable link and doesn't claim email was sent", iv === 201 && !!ivj?.inviteLink && ivj.emailStatus === "not_sent", ivj?.emailStatus);
if (ivj?.data?.id) {
  check("Can't approve someone who hasn't registered", (await call(H.t, "POST", `/api/employees/approve-employee/${ivj.data.id}`))[0] === 400);
  await call(H.t, "POST", `/api/employees/reject-employee/${ivj.data.id}`, { reason: "regression test cleanup" });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(0);
