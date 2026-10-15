// Release notes ("What's new") and feedback: access, validation, publish/unpublish + notifications, seen state,
// anonymous handling, replies, convert-to-bug. Test accounts only; cleans up everything it creates
// (the seeded v1.0.0 release is left in place).
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync("C:/Users/SHIVA/Downloads/WebApp/_local/test-accounts.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const B = "http://127.0.0.1:5000";
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const login = async (w) => { const j = await (await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: env[w + "_EMAIL"], password: env.TEST_PASSWORD }) })).json(); if (!j.token) throw new Error(`Login failed for ${w}: ${j.message}`); return { t: j.token, id: j.user?.id }; };
const call = async (x, m, p, b) => { const r = await fetch(B + p, { method: m, headers: { authorization: "Bearer " + x.t, ...(b ? { "content-type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch {} return [r.status, j]; };
const A = await login("ADMIN"), I = await login("IT"), H = await login("HR"), E = await login("EMPLOYEE");

const cleanup = { releases: [], feedback: [], bugs: [] };
try {
  // ── Releases: read + seed ─────────────────────────────────────────────────
  let [s, j] = await call(E, "GET", "/api/releases");
  check("Everyone can list releases", s === 200, `${s}`);
  const seed = j.data.find((r) => r.version === "v1.0.0");
  check("v1.0.0 is seeded and published", seed?.status === "PUBLISHED" && !!seed.publishedAt);
  check("Seed has the documented modules", ["Accounts & Finance", "Timesheets", "Attendance", "Leave", "Expense claims", "Help desk", "Management", "Dashboards", "Security", "General"].every((m) => seed?.sections.some((x) => x.module === m)));
  check("Seed has all four tags", ["feature", "fix", "improvement", "security"].every((t) => seed?.tags.includes(t)));
  check("Employee can't manage releases", j.canManage === false);
  [s, j] = await call(E, "GET", "/api/releases?all=1");
  check("Employee doesn't see drafts with ?all=1", s === 200 && j.data.every((r) => r.status === "PUBLISHED"));
  [s, j] = await call(E, "GET", "/api/releases/v1.0.0");
  check("Release by version", s === 200 && j.data.id === seed.id);

  // ── Releases: permissions + validation ────────────────────────────────────
  const ver = `v99.${Date.now() % 100000}.0`;
  const good = { version: ver, title: "Regression test release", summary: "Test only", tags: ["fix"], sections: [{ module: "Timesheets", items: [{ type: "Fixed", text: "Test item" }] }] };
  [s] = await call(E, "POST", "/api/releases", good);
  check("Employee can't create a release", s === 403);
  [s] = await call(H, "POST", "/api/releases", good);
  check("HR can't create a release", s === 403);
  [s, j] = await call(A, "POST", "/api/releases", { ...good, version: "1.2" });
  check("Bad version format refused", s === 400 && /v1\.4\.0/.test(j.message), j?.message);
  [s, j] = await call(A, "POST", "/api/releases", { ...good, sections: [] });
  check("Empty sections refused", s === 400, j?.message);
  [s, j] = await call(A, "POST", "/api/releases", { ...good, sections: [{ module: "X", items: [{ type: "Removed", text: "a" }] }] });
  check("Unknown item type refused", s === 400, j?.message);
  [s, j] = await call(A, "POST", "/api/releases", { ...good, sections: [{ module: "X", items: [{ type: "New", text: "  " }] }] });
  check("Empty item text refused", s === 400, j?.message);
  [s, j] = await call(A, "POST", "/api/releases", { ...good, tags: ["marketing"] });
  check("Unknown tag refused", s === 400, j?.message);
  [s, j] = await call(A, "POST", "/api/releases", { ...good, version: "v1.0.0" });
  check("Duplicate version refused", s === 409, j?.message);

  // ── Draft lifecycle ───────────────────────────────────────────────────────
  [s, j] = await call(I, "POST", "/api/releases", good);
  check("IT creates a draft", s === 201 && j.data.status === "DRAFT", j?.message);
  const rel = j.data;
  if (rel) cleanup.releases.push(rel.id);
  [s] = await call(E, "GET", `/api/releases/${rel.id}`);
  check("Employee can't open a draft", s === 404);
  [s, j] = await call(A, "GET", "/api/releases?all=1");
  check("Managers see drafts with ?all=1", j.data.some((r) => r.id === rel.id));
  [s, j] = await call(A, "PUT", `/api/releases/${rel.id}`, { title: "Regression test release (edited)" });
  check("Admin edits the draft", s === 200 && j.data.title.endsWith("(edited)"), j?.message);
  [s, j] = await call(A, "PUT", `/api/releases/${rel.id}`, { version: "v1.0.0" });
  check("Edit to an existing version refused", s === 409, j?.message);

  // ── Seen state + publish ──────────────────────────────────────────────────
  [s] = await call(E, "POST", `/api/releases/${seed.id}/seen`);
  check("Mark v1.0.0 seen", s === 200);
  [s, j] = await call(E, "GET", "/api/releases/latest-unseen");
  check("Nothing unseen after seeing the latest", s === 200 && j.data === null, JSON.stringify(j?.data?.version));
  [s] = await call(E, "POST", `/api/releases/${rel.id}/seen`);
  check("Can't mark a draft seen", s === 404);
  [s] = await call(E, "POST", `/api/releases/${rel.id}/publish`);
  check("Employee can't publish", s === 403);

  [s, j] = await call(A, "POST", `/api/releases/${rel.id}/publish`);
  check("Admin publishes; people are notified", s === 200 && j.data.status === "PUBLISHED" && j.notified > 0, `${j?.message}`);
  const notified = j.notified;
  [s, j] = await call(A, "POST", `/api/releases/${rel.id}/publish`);
  check("Publishing twice refused", s === 400);
  [s, j] = await call(E, "GET", "/api/releases/latest-unseen");
  check("Employee now has the new release unseen", j.data?.id === rel.id);
  [s, j] = await call(E, "GET", "/api/notifications");
  const note = (j?.data ?? []).find((n) => n.relatedId === rel.id);
  check("Employee got a notification linking to /releases#version", note?.actionUrl === `/releases#${ver}`, note?.actionUrl);
  [s, j] = await call(A, "DELETE", `/api/releases/${rel.id}`);
  check("Can't delete a published release", s === 400, j?.message);

  [s, j] = await call(A, "POST", `/api/releases/${rel.id}/unpublish`);
  check("Unpublish withdraws every notification", s === 200 && j.withdrawn === notified, `${j?.withdrawn}/${notified}`);
  [s, j] = await call(E, "GET", "/api/releases/latest-unseen");
  check("Unseen goes back to nothing", j.data === null);
  [s, j] = await call(A, "DELETE", `/api/releases/${rel.id}`);
  check("Draft deleted", s === 200, j?.message);
  if (s === 200) cleanup.releases = [];

  // ── Feedback ──────────────────────────────────────────────────────────────
  [s, j] = await call(E, "POST", "/api/feedback", { category: "Idea", message: "abc" });
  check("Too-short message refused", s === 400, j?.message);
  [s, j] = await call(E, "POST", "/api/feedback", { category: "Idea", message: "x".repeat(2001) });
  check("Over 2000 chars refused", s === 400, j?.message);
  [s, j] = await call(E, "POST", "/api/feedback", { category: "Idea", rating: 7, message: "Nice portal overall" });
  check("Rating out of range refused", s === 400, j?.message);
  [s, j] = await call(E, "POST", "/api/feedback", { category: "Rant", message: "Nice portal overall" });
  check("Unknown category refused", s === 400, j?.message);

  [s, j] = await call(E, "POST", "/api/feedback", { category: "Problem", rating: 2, message: "[test] Timesheet export downloads an empty file", module: "Timesheet", pageUrl: "/timesheet" });
  check("Employee sends feedback", s === 201 && j.data.status === "NEW", j?.message);
  const fb1 = j.data; cleanup.feedback.push(fb1.id);
  [s, j] = await call(E, "POST", "/api/feedback", { category: "Idea", rating: 5, message: "[test] Anonymous idea about dark mode", anonymous: true });
  check("Employee sends anonymous feedback", s === 201 && j.data.anonymous === true);
  const fb2 = j.data; cleanup.feedback.push(fb2.id);

  [s, j] = await call(E, "GET", "/api/feedback");
  check("Employee sees own feedback (incl. anonymous)", s === 200 && [fb1.id, fb2.id].every((id) => j.data.some((f) => f.id === id && f.mine)));
  check("Employee list is only their own", j.data.every((f) => f.mine) && j.reviewer === false);

  [s, j] = await call(H, "GET", "/api/feedback");
  check("HR sees all feedback with summary", s === 200 && j.reviewer === true && typeof j.summary?.counts?.NEW === "number" && "averageRating" in j.summary);
  const anonRow = j.data.find((f) => f.id === fb2.id);
  check("Anonymous sender hidden from reviewers", anonRow && anonRow.sender === null && anonRow.employeeId === null);
  check("Named sender shown to reviewers", j.data.find((f) => f.id === fb1.id)?.sender?.id === E.id);
  [s, j] = await call(H, "GET", "/api/feedback?category=Problem&q=empty%20file");
  check("Reviewer filters by category and text", j.data.some((f) => f.id === fb1.id) && j.data.every((f) => f.category === "Problem"));
  [s, j] = await call(H, "GET", "/api/feedback?mine=1");
  check("Reviewer can list just their own", j.data.every((f) => f.mine));

  [s] = await call(E, "PATCH", `/api/feedback/${fb1.id}`, { status: "DONE" });
  check("Employee can't review", s === 403);
  [s, j] = await call(H, "PATCH", `/api/feedback/${fb1.id}`, { status: "WHATEVER" });
  check("Bad status refused", s === 400);
  [s, j] = await call(H, "PATCH", `/api/feedback/${fb1.id}`, { response: "[test] Thanks, we're on it." });
  check("HR replies; New becomes Reviewed", s === 200 && j.data.status === "REVIEWED" && j.data.respondedBy, j?.message);
  [s, j] = await call(E, "GET", "/api/notifications");
  const reply = (j?.data ?? []).find((n) => n.relatedId === fb1.id && n.type === "Feedback");
  check("Sender notified of the reply", !!reply && reply.actionUrl === "/feedback");
  if (reply) await call(E, "DELETE", `/api/notifications/${reply.id}`);
  [s, j] = await call(H, "PATCH", `/api/feedback/${fb2.id}`, { response: "[test] Reply to anonymous", status: "PLANNED" });
  check("Reply to anonymous saved", s === 200 && j.data.status === "PLANNED");
  [s, j] = await call(E, "GET", "/api/notifications");
  check("Anonymous sender isn't notified", !(j?.data ?? []).some((n) => n.relatedId === fb2.id));
  [s, j] = await call(E, "GET", "/api/feedback");
  check("Sender sees the reply in their list", j.data.find((f) => f.id === fb2.id)?.response === "[test] Reply to anonymous");

  [s, j] = await call(E, "DELETE", `/api/feedback/${fb1.id}`);
  check("Sender can't delete once reviewed", s === 400, j?.message);

  // convert to bug
  [s, j] = await call(E, "POST", `/api/feedback/${fb1.id}/convert-to-bug`);
  check("Employee can't convert to bug", s === 403);
  [s, j] = await call(H, "POST", `/api/feedback/${fb1.id}/convert-to-bug`);
  if (s === 503) {
    check("Bug tracker missing → clear 503", /isn’t ready yet/.test(j.message), j.message);
  } else {
    check("Convert to bug returns the bug code and plans the feedback", s === 200 && !!j.bug?.id && !!j.bug?.code && j.data.status === "PLANNED" && j.data.bugId === j.bug.id, `${s} ${j?.message}`);
    if (j.bug?.id) cleanup.bugs.push(j.bug.id);
    const [s2, j2] = await call(H, "POST", `/api/feedback/${fb1.id}/convert-to-bug`);
    check("Converting twice refused", s2 === 409, j2?.message);
    if (j.bug?.id) {
      const [bs, bj] = await call(A, "GET", `/api/bugs/${j.bug.id}`);
      check("Bug carries the feedback text", bs === 200 && /From feedback \(Problem, rating 2\/5\)/.test(bj.data?.description ?? "") && bj.data?.type === "Bug", `${bs}`);
    }
  }
  [s, j] = await call(H, "GET", "/api/feedback");
  check("Summary counts conversions", j.summary.convertedToBugs >= (cleanup.bugs.length ? 1 : 0));

  // own delete while NEW
  [s, j] = await call(E, "POST", "/api/feedback", { category: "Praise", message: "[test] delete me please" });
  const fb3 = j.data; cleanup.feedback.push(fb3.id);
  [s] = await call(I, "DELETE", `/api/feedback/${fb2.id}`);
  check("Reviewer (IT) deletes any feedback", s === 200);
  if (s === 200) cleanup.feedback = cleanup.feedback.filter((x) => x !== fb2.id);
  [s, j] = await call(E, "DELETE", `/api/feedback/${fb3.id}`);
  check("Sender deletes own feedback while New", s === 200, j?.message);
  if (s === 200) cleanup.feedback = cleanup.feedback.filter((x) => x !== fb3.id);
} finally {
  for (const id of cleanup.releases) { await call(A, "POST", `/api/releases/${id}/unpublish`); await call(A, "DELETE", `/api/releases/${id}`); }
  for (const id of cleanup.feedback) await call(H, "DELETE", `/api/feedback/${id}`);
  for (const id of cleanup.bugs) { const [s, j] = await call(A, "DELETE", `/api/bugs/${id}`); console.log(`   cleanup bug: ${s} ${j?.message ?? ""}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
