// Partner / HR dashboards and the "waiting for you" counts. Read-only; test logins only.
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync("C:/Users/SHIVA/Downloads/WebApp/_local/test-accounts.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const B = "http://127.0.0.1:5000";
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const login = async (w) => { const j = await (await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: env[w + "_EMAIL"], password: env.TEST_PASSWORD }) })).json(); return { t: j.token, id: j.user?.id }; };
const get = async (t, p) => { const r = await fetch(B + p, { headers: { authorization: "Bearer " + t } }); let j = null; try { j = await r.json(); } catch {} return [r.status, j]; };
const A = await login("ADMIN"), H = await login("HR"), M = await login("MANAGER"), P = await login("PARTNER"), E = await login("EMPLOYEE");

let [s, j] = await get(A.t, "/api/insights/partners");
check("Admin gets the partner list", s === 200 && j.data.length > 0, `${j?.data?.length} partners`);
const big = j.data.find((p) => !/Test/.test(p.name));
[s, j] = await get(A.t, `/api/insights/partner?period=fy&partnerId=${big.id}`);
const d = j.data;
check("Admin can view a partner's dashboard", s === 200 && d.lead.id === big.id && d.team.size > 0, `${d?.lead?.name}: ${d?.team?.size} people`);
check("Billable % is consistent with hours", d.work.hours === 0 || d.work.billablePct === Math.round((d.work.billableHours / d.work.hours) * 100), `${d.work.billablePct}%`);
check("Client hours never exceed team hours", d.work.byClient.reduce((x, c) => x + c.hours, 0) <= d.work.hours + 0.01);
check("Person hours add up to team hours", Math.abs(d.work.byPerson.reduce((x, p) => x + p.hours, 0) - d.work.hours) < 0.05, `${d.work.byPerson.reduce((x, p) => x + p.hours, 0)} vs ${d.work.hours}`);
check("8-week trend has 8 weeks", d.work.trend.length === 8);
check("Today adds up to the team (or it's an off day)", d.team.today.offDay || d.team.today.present + d.team.today.late + d.team.today.onLeave + d.team.today.notIn === d.team.size);
check("Someone else's view has no personal queue", d.queue === null);
for (const period of ["month", "last-month", "quarter", "fy"]) {
  const [st, pj] = await get(A.t, `/api/insights/partner?period=${period}&partnerId=${big.id}`);
  check(`Period "${period}" works`, st === 200 && !!pj.data.period.label, pj?.data?.period?.label);
}
[s, j] = await get(M.t, "/api/insights/partner");
check("Manager sees own team dashboard with a queue", s === 200 && j.data.queue !== null, `${j?.data?.team?.size} people`);
[s] = await get(M.t, `/api/insights/partner?partnerId=${big.id}`);
check("Manager can't view another partner", s === 403);
[s] = await get(M.t, "/api/insights/partners");
check("Manager can't list partners", s === 403);
[s] = await get(E.t, "/api/insights/partner");
check("Employee without reports gets no team dashboard", s === 403);
[s, j] = await get(P.t, "/api/insights/partner");
check("Partner sees own dashboard", s === 200);

[s, j] = await get(H.t, "/api/insights/hr");
const h = j.data;
check("HR dashboard loads", s === 200 && h.headcount.active > 0, `${h?.headcount?.active} active`);
check("Department/designation groups add up to headcount", h.headcount.byDesignation.reduce((x, g) => x + g.count, 0) === h.headcount.active);
check("Document counts cover active staff only", !h.documents || h.documents.missingPeople <= h.headcount.active);
check("12 months of joiners/leavers", h.movement.months.length === 12);
check("Today adds up to headcount (or it's an off day)", h.today.offDay || h.today.present + h.today.late + h.today.onLeave + h.today.notIn === h.headcount.active);
[s] = await get(E.t, "/api/insights/hr");
check("Employee can't open the HR dashboard", s === 403);
[s] = await get(M.t, "/api/insights/hr");
check("Manager can't open the HR dashboard", s === 403);

// My dashboard: the "waiting for you" counts follow the reporting line, not the whole firm
const [, mc] = await get(M.t, "/api/dashboard/combined");
const [, mq] = await get(M.t, "/api/insights/partner");
check("My-dashboard leave count = what the manager can act on", mc.data.pendingApprovals.leaves === mq.data.queue.leaves, `${mc.data.pendingApprovals.leaves} vs ${mq.data.queue.leaves}`);
check("My-dashboard claim count = what the manager can act on", mc.data.pendingApprovals.reimbursements === mq.data.queue.claims, `${mc.data.pendingApprovals.reimbursements} vs ${mq.data.queue.claims}`);
console.log(`\n${pass} passed, ${fail} failed`);
