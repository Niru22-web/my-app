import { fileURLToPath as __toPath } from "url";
const __ROOT = __toPath(new URL("../../", import.meta.url)).split(String.fromCharCode(92)).join("/").replace(/\/$/, "");
// Claims: access, per-claim flags, policy limits, notifications, helpdesk return, inbox approve guard. Test accounts only.
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(__ROOT + "/_local/test-accounts.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const B = "http://127.0.0.1:5000";
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const login = async (w) => { const j = await (await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: env[w + "_EMAIL"], password: env.TEST_PASSWORD }) })).json(); return { t: j.token, id: j.user?.id }; };
const call = async (t, m, p, b) => { const r = await fetch(B + p, { method: m, headers: { authorization: "Bearer " + t, ...(b ? { "content-type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch {} return [r.status, j]; };
const A = await login("ADMIN"), H = await login("HR"), M = await login("MANAGER"), E = await login("EMPLOYEE"), C = await login("ACCOUNTANT"), I = await login("IT");

const acc = async (x) => (await call(x.t, "GET", "/api/reimbursements/access"))[1].data;
const [ae, am, ac] = [await acc(E), await acc(M), await acc(C)];
check("Employee without reports has no team tab", ae.team === false, JSON.stringify(ae));
check("Accountant sees firm-wide and can pay", ac.org && ac.pay, JSON.stringify(ac));

// who does the employee report to?
const me = (await call(A.t, "GET", `/api/employees/${E.id}`))[1].data;
console.log("   employee reports to manager:", !!me.managerId, "partner:", !!me.partnerId);

// policy
let [s, j] = await call(H.t, "PUT", "/api/expense-policies", { category: "Travel", perClaimLimit: 5000, receiptRequiredAbove: 1000 });
check("HR sets a Travel policy", s === 200, j?.message);
[s, j] = await call(E.t, "PUT", "/api/expense-policies", { category: "Travel", perClaimLimit: 999999 });
check("Employee can't change policies", s === 403);
const claim = async (amount) => { const fd = new FormData(); fd.append("category", "Travel"); fd.append("amount", String(amount)); fd.append("date", new Date().toISOString().slice(0, 10)); fd.append("description", "policy test"); const r = await fetch(B + "/api/reimbursements", { method: "POST", headers: { authorization: "Bearer " + E.t }, body: fd }); return [r.status, await r.json()]; };
[s, j] = await claim(6000);
check("Over the per-claim limit is refused", s === 400 && /limited/.test(j.message), j.message);
[s, j] = await claim(1500);
check("Above bill threshold without a bill is refused", s === 400 && /bill/i.test(j.message), j.message);
[s, j] = await claim(800);
check("Within policy is accepted", s === 201, j.message);
const cid = j.data?.id;

// manager sees it with flags (if manager is in the employee's line)
const team = (await call(M.t, "GET", "/api/reimbursements/team-approvals?status=pending"))[1].data ?? [];
const row = team.find((c) => c.id === cid);
if (row) check("Manager's list says they can approve it", row.canApprove === true && !!row.approveLevel, row.approveLevel);
else console.log("   (manager isn't in the test employee's reporting line — flag check skipped)");
const accList = (await call(C.t, "GET", "/api/reimbursements/team-approvals?status=pending"))[1].data ?? [];
const accRow = accList.find((c) => c.id === cid);
check("Accountant sees it but can't approve", !!accRow && accRow.canApprove === false, String(accRow?.canApprove));

// notification to an approver
const notes = async (x) => ((await call(x.t, "GET", "/api/notifications"))[1].data ?? []);
const all = [...(await notes(M)), ...(await notes(A))];
check("An approver was notified of the new claim", all.some((n) => /Expense claim to approve/.test(n.title) && n.message.includes(j.data.claimId)));
await call(E.t, "DELETE", `/api/reimbursements/${cid}`);
const pol = (await call(H.t, "GET", "/api/expense-policies"))[1].data.find((p) => p.category === "Travel");
await call(H.t, "DELETE", `/api/expense-policies/${pol.id}`);

// inbox approve can't bypass the real rules
[s, j] = await call(M.t, "POST", "/api/notifications/approve-employee", { employeeId: E.id });
check("Manager can't approve accounts via the inbox", s === 403, `${s} ${j?.message}`);
[s, j] = await call(H.t, "POST", "/api/notifications/approve-employee", { employeeId: E.id });
check("Inbox approve of an active employee is refused like the real route", s === 400, `${s} ${j?.message}`);

// help desk: return to raiser changes status and notifies
const fd = new FormData(); fd.append("title", "Return test"); fd.append("description", "x");
let r = await fetch(B + "/api/tickets", { method: "POST", headers: { authorization: "Bearer " + E.t }, body: fd }); const t = (await r.json()).data;
const fd2 = new FormData(); fd2.append("remarks", "Need the asset tag"); fd2.append("action", "Returned"); fd2.append("toStatus", "Returned");
r = await fetch(B + `/api/tickets/${t.id}/history`, { method: "POST", headers: { authorization: "Bearer " + I.t }, body: fd2 });
const after = (await call(E.t, "GET", `/api/tickets/${t.id}`))[1].data;
check("Return to raiser sets status Returned", after.status === "Returned", after.status);
check("Raiser is notified of the reply", (await notes(E)).some((n) => n.title.includes(t.ticketId)));
await call(A.t, "DELETE", `/api/tickets/${t.id}`);

// chat returns latest
[s, j] = await call(E.t, "GET", "/api/chat");
check("Chat loads", s === 200);
console.log(`\n${pass} passed, ${fail} failed`);
