import { fileURLToPath as __toPath } from "url";
const __ROOT = __toPath(new URL("../../", import.meta.url)).split(String.fromCharCode(92)).join("/").replace(/\/$/, "");
// Run with the API running locally:  node backend/tests/bugs-regression.mjs
// Bug tracker: create/validate, permissions (triage, assignee, reporter), files, feeds, export.
// Uses the local test accounts in _local/test-accounts.env and deletes every bug it creates.
import fs from "fs";

const env = Object.fromEntries(fs.readFileSync(__ROOT + "/_local/test-accounts.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const B = "http://127.0.0.1:5000";
const UPLOADS = __ROOT + "/backend";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const login = async (who) => {
  const r = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: env[who + "_EMAIL"], password: env.TEST_PASSWORD }) });
  const j = await r.json();
  if (!j.token) throw new Error(`Login failed for ${who} (${r.status})`);
  return { t: j.token, id: j.user?.id };
};
const call = async (t, m, p, b) => {
  const form = b instanceof FormData;
  const r = await fetch(B + p, { method: m, headers: { ...(t ? { authorization: "Bearer " + t } : {}), ...(b && !form ? { "content-type": "application/json" } : {}) }, body: form ? b : b ? JSON.stringify(b) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return [r.status, j];
};
const raw = (t, p) => fetch(B + p, { headers: t ? { authorization: "Bearer " + t } : {} });
// 1×1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const A = await login("ADMIN"), I = await login("IT"), E = await login("EMPLOYEE"), M = await login("MANAGER");
const created = [];
const mk = async (who, body) => {
  const [s, j] = await call(who.t, "POST", "/api/bugs", body);
  if (j?.data?.id) created.push(j.data.id);
  return [s, j];
};

try {
  // ── Create & validate ──────────────────────────────────────────────────────
  const [s1, j1] = await mk(E, { title: "[TEST] Timesheet total wrong", description: "Weekly total shows 0 h after saving.", type: "Bug", module: "Timesheet", priority: "High", environment: "UAT", pageUrl: "/timesheet" });
  check("Employee can report a bug (Feedback JSON contract)", s1 === 201 && !!j1?.data?.id && /^BUG-\d{8}-\d{5}$/.test(j1?.data?.code ?? ""), `${s1} ${j1?.data?.code}`);
  const b1 = j1.data.id;
  const due = new Date(j1.data.dueDate).getTime() - Date.now();
  check("High priority gets a ~3 day due date", due > 2 * 86_400_000 && due < 4 * 86_400_000);
  check("Title under 5 characters is refused", (await mk(E, { title: "abc", description: "x" }))[0] === 400);
  check("Missing description is refused", (await mk(E, { title: "[TEST] no description" }))[0] === 400);
  check("Unknown module is refused", (await mk(E, { title: "[TEST] bad module", description: "x", module: "Nope" }))[0] === 400);

  const fd = new FormData();
  fd.append("title", "[TEST] Leave page screenshot");
  fd.append("description", "See the attached screenshot.");
  fd.append("priority", "Critical");
  fd.append("files", new Blob([PNG], { type: "image/png" }), "shot.png");
  const [s2, j2] = await mk(E, fd);
  check("Report with a screenshot (multipart)", s2 === 201, String(s2));
  const b2 = j2.data.id;

  const bad = new FormData();
  bad.append("title", "[TEST] bad file");
  bad.append("description", "x");
  bad.append("files", new Blob(["<b>x</b>"], { type: "text/html" }), "page.html");
  check("Blocked file type is refused", (await mk(E, bad))[0] === 400);

  // Race-safe numbering
  const par = await Promise.all([1, 2, 3, 4].map((n) => mk(I, { title: `[TEST] parallel ${n}`, description: "parallel create" })));
  const codes = par.map(([, j]) => j?.data?.code);
  check("Parallel reports get distinct codes", par.every(([s]) => s === 201) && new Set(codes).size === 4, codes.join(" "));

  // ── Read ───────────────────────────────────────────────────────────────────
  const [ls, lj] = await call(M.t, "GET", "/api/bugs");
  check("Anyone can list all bugs, with counts", ls === 200 && lj.data.some((b) => b.id === b1) && typeof lj.counts?.byStatus?.Open === "number");
  const row = lj.data.find((b) => b.id === b1);
  check("List rows carry names, comment count and past-due flag", row?.reporter?.name && row.commentCount === 0 && row.isPastDue === false);
  const [, fj] = await call(M.t, "GET", "/api/bugs?q=Timesheet%20total&field=subject&priority=High");
  check("Search by subject + priority filter", fj?.data?.length >= 1 && fj.data.every((b) => b.priority === "High"));
  const [, d2] = await call(E.t, "GET", `/api/bugs/${b2}`);
  const file = d2?.data?.events?.[0]?.files?.[0];
  check("Detail has events oldest-first with the screenshot", d2?.data?.events?.[0]?.kind === "created" && !!file?.path, file?.path);

  // ── Permissions ────────────────────────────────────────────────────────────
  check("Employee can't assign", (await call(E.t, "PATCH", `/api/bugs/${b1}`, { assigneeId: E.id }))[0] === 403);
  check("Employee can't change priority", (await call(E.t, "PATCH", `/api/bugs/${b1}`, { priority: "Low" }))[0] === 403);
  check("Reporter can't change status of an Open ticket", (await call(E.t, "PATCH", `/api/bugs/${b1}`, { status: "Resolved" }))[0] === 403);
  check("Other staff can't edit someone's ticket", (await call(M.t, "PATCH", `/api/bugs/${b1}`, { title: "[TEST] hijacked title" }))[0] === 403);
  const [es] = await call(E.t, "PATCH", `/api/bugs/${b1}`, { title: "[TEST] Timesheet weekly total wrong" });
  check("Reporter can edit the title while Open", es === 200);
  const [is, ij] = await call(I.t, "PATCH", `/api/bugs/${b1}`, { assigneeId: I.id, priority: "Critical", externalRef: "#1095" });
  const kinds = ij?.data?.events?.map((e) => e.kind) ?? [];
  check("IT can assign, set priority and external ref (events written)", is === 200 && kinds.includes("assign") && kinds.includes("priority") && ij.data.externalRef === "#1095", kinds.join(","));
  check("Reporter can't delete once assigned", (await call(E.t, "DELETE", `/api/bugs/${b1}`))[0] === 403);
  check("IT moves it to Resolved", (await call(I.t, "PATCH", `/api/bugs/${b1}`, { status: "Resolved" }))[0] === 200);
  check("Someone else can't reopen", (await call(M.t, "PATCH", `/api/bugs/${b1}`, { status: "Reopened", comment: "x" }))[0] === 403);
  check("Reporter must say why when reopening", (await call(E.t, "PATCH", `/api/bugs/${b1}`, { status: "Reopened" }))[0] === 400);
  const [rs, rj] = await call(E.t, "PATCH", `/api/bugs/${b1}`, { status: "Reopened", comment: "Still shows 0 h on Monday." });
  check("Reporter can reopen with a comment", rs === 200 && rj.data.status === "Reopened" && rj.data.resolvedAt === null);

  // Assignee (non-triage) moves the work along
  check("Admin assigns to a manager", (await call(A.t, "PATCH", `/api/bugs/${b2}`, { assigneeId: M.id }))[0] === 200);
  check("Assignee can move to Ready to Test", (await call(M.t, "PATCH", `/api/bugs/${b2}`, { status: "Ready to Test" }))[0] === 200);
  check("Assignee can't mark Not a Bug", (await call(M.t, "PATCH", `/api/bugs/${b2}`, { status: "Not a Bug" }))[0] === 403);
  check("Assignee can't reassign", (await call(M.t, "PATCH", `/api/bugs/${b2}`, { assigneeId: null }))[0] === 403);
  check("Can't assign to an unknown person", (await call(I.t, "PATCH", `/api/bugs/${b2}`, { assigneeId: "00000000-0000-0000-0000-000000000000" }))[0] === 400);

  // ── Files ──────────────────────────────────────────────────────────────────
  const fp = file.path;
  check("Anonymous can't open a bug screenshot", (await raw(null, fp)).status === 401);
  check("Reporter can open it", (await raw(E.t, fp)).status === 200);
  check("IT can open it", (await raw(I.t, fp)).status === 200);
  check("Assignee can open it", (await raw(M.t, fp)).status === 200);
  // b1 has no files; add one as IT then check an unrelated person (Manager) can't open it until they comment.
  const cf = new FormData();
  cf.append("body", "Here is what I see.");
  cf.append("files", new Blob([PNG], { type: "image/png" }), "it.png");
  const [cs, cj] = await call(I.t, "POST", `/api/bugs/${b1}/comments`, cf);
  check("Comment with attachment", cs === 201 && cj?.data?.files?.length === 1);
  const fp1 = cj.data.files[0].path;
  check("Unrelated staff can't open it", (await raw(M.t, fp1)).status === 403);
  check("Empty comment is refused", (await call(M.t, "POST", `/api/bugs/${b1}/comments`, { body: "  " }))[0] === 400);
  check("Anyone can comment", (await call(M.t, "POST", `/api/bugs/${b1}/comments`, { body: "Seeing this too." }))[0] === 201);
  check("…and then can open the attachment", (await raw(M.t, fp1)).status === 200);

  // ── Feeds & export ─────────────────────────────────────────────────────────
  const [ss, sj] = await call(E.t, "GET", "/api/bugs/summary");
  check("Summary", ss === 200 && sj.data.byStatus.length === 7 && sj.data.daily.length === 14 && sj.data.recent.length > 0 && typeof sj.data.deltas.all.current === "number");
  const [as, aj] = await call(E.t, "GET", "/api/bugs/activity?page=1&limit=5");
  check("Activity is paged", as === 200 && aj.data.length <= 5 && aj.total >= 5 && Array.isArray(aj.people));
  const [, kj] = await call(E.t, "GET", "/api/bugs/activity?kind=comment&limit=50");
  check("Activity filter by kind", kj.data.every((e) => e.kind === "comment"));
  const [, asg] = await call(E.t, "GET", "/api/bugs/assignees");
  check("Assignees include IT and the current assignee", asg.data.some((p) => p.id === I.id) && asg.data.some((p) => p.id === M.id));
  const [, mine] = await call(M.t, "GET", "/api/bugs?assignee=me");
  check("assignee=me filter", mine.data.some((b) => b.id === b2) && mine.data.every((b) => b.assignee?.id === M.id));
  const x = await raw(E.t, "/api/bugs/export?priority=Critical");
  check("Excel export", x.status === 200 && (x.headers.get("content-type") ?? "").includes("spreadsheetml"));

  // ── Delete ─────────────────────────────────────────────────────────────────
  const own = created[created.length - 1];
  check("Others can't delete a ticket", (await call(M.t, "DELETE", `/api/bugs/${own}`))[0] === 403);
  const [, j3] = await mk(E, { title: "[TEST] delete me", description: "to be deleted", priority: "Low" });
  check("Reporter can delete own Open, unassigned ticket", (await call(E.t, "DELETE", `/api/bugs/${j3.data.id}`))[0] === 200);
} finally {
  // ── Clean up everything created ────────────────────────────────────────────
  const files = [];
  for (const id of created) {
    const [, d] = await call(A.t, "GET", `/api/bugs/${id}`);
    for (const e of d?.data?.events ?? []) for (const f of e.files ?? []) files.push(f.path);
    await call(A.t, "DELETE", `/api/bugs/${id}`);
  }
  const left = [];
  for (const id of created) if ((await call(A.t, "GET", `/api/bugs/${id}`))[0] !== 404) left.push(id);
  check("Clean-up: every test bug deleted", left.length === 0, `${created.length} created`);
  check("Clean-up: attachment files removed from disk", files.every((p) => !fs.existsSync(UPLOADS + p)), `${files.length} files`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
