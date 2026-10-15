// Announcements + wishes: access, audience rules, send-once, banner/read, schedule/cancel, templates, wishes.
// Sends only to test accounts (@asa-local.test). Wish tests address everyone briefly and are deleted straight after.
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync("C:/Users/SHIVA/Downloads/WebApp/_local/test-accounts.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const B = "http://127.0.0.1:5000";
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const login = async (w) => { const j = await (await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: env[w + "_EMAIL"], password: env.TEST_PASSWORD }) })).json(); return { t: j.token, id: j.user?.id }; };
const call = async (x, m, p, b) => { const r = await fetch(B + p, { method: m, headers: { authorization: "Bearer " + x.t, ...(b ? { "content-type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch {} return [r.status, j]; };
const A = await login("ADMIN"), H = await login("HR"), E = await login("EMPLOYEE"), M = await login("MANAGER");
if (!A.t || !H.t || !E.t || !M.t) { console.log("Login failed — check test accounts / rate limit"); process.exit(1); }
const P = "/api/announcements";
const DEFAULT_NAMES = new Set(["Birthday", "Work anniversary", "Diwali", "Holi", "Ganesh Chaturthi", "Navratri / Dussehra", "Christmas", "New Year", "Eid", "Makar Sankranti / Pongal", "Independence Day", "Republic Day"]);
const created = [];
const testOnly = { employeeIds: [E.id, M.id] };

try {
  // ── Access ──
  let [s, j] = await call(E, "POST", P, { title: "x", message: "y", action: "draft" });
  check("Employee can't create announcements", s === 403);
  [s] = await call(E, "GET", `${P}/audience-options`);
  check("Employee can't read audience options", s === 403);
  [s] = await call(E, "GET", `${P}/templates`);
  check("Employee can't read templates", s === 403);

  // ── Templates seeded, nothing auto ──
  [s, j] = await call(H, "GET", `${P}/templates`);
  const tpls = j?.data ?? [];
  check("Templates listed (seeded defaults present)", s === 200 && tpls.some((t) => t.kind === "BIRTHDAY") && tpls.some((t) => t.kind === "ANNIVERSARY") && tpls.filter((t) => t.kind === "FESTIVAL").length >= 10, `${tpls.length} templates`);
  check("No template sends automatically by default", tpls.filter((t) => DEFAULT_NAMES.has(t.name)).every((t) => t.autoSend === false));

  // ── Audience ──
  [s, j] = await call(H, "GET", `${P}/audience-options`);
  const opts = j?.data;
  check("Audience options list departments/roles/people", s === 200 && opts.departments.length > 0 && opts.roles.length > 0 && opts.people.some((p) => p.id === E.id));
  [s, j] = await call(H, "POST", `${P}/audience-preview`, { audience: testOnly });
  check("Preview of two people = 2", s === 200 && j.data.count === 2 && !j.data.everyone, JSON.stringify(j?.data?.names));
  [s, j] = await call(H, "POST", `${P}/audience-preview`, { audience: {} });
  check("Empty audience = all active staff", j.data.everyone && j.data.count === opts.totalActive, `${j.data.count}`);
  [s, j] = await call(H, "POST", `${P}/audience-preview`, { audience: { roles: ["HR"] } });
  const hrCount = j.data.count;
  [s, j] = await call(H, "POST", `${P}/audience-preview`, { audience: { roles: ["HR"], departments: ["__no_such_department__"] } });
  check("Across dimensions = AND", hrCount >= 1 && j.data.count === 0, `HR=${hrCount}, HR∧none=${j.data.count}`);
  [s, j] = await call(H, "POST", `${P}/audience-preview`, { audience: { roles: ["HR", "__nope__"] } });
  check("Within a dimension = OR", j.data.count === hrCount);
  [s, j] = await call(H, "POST", `${P}/audience-preview`, { audience: { departments: ["__no_such_department__"], employeeIds: [E.id] } });
  check("Picked people are always included", j.data.count === 1);

  // ── Draft → edit → send once ──
  [s, j] = await call(H, "POST", P, { title: "Regression notice", message: "Line one\nLine two", category: "Policy", audience: testOnly, action: "draft" });
  check("HR saves a draft", s === 201 && j.data.status === "DRAFT", j?.message);
  const d1 = j.data.id; created.push(d1);
  [s, j] = await call(H, "PUT", `${P}/${d1}`, { title: "Regression notice (edited)" });
  check("Draft can be edited", s === 200 && j.data.title === "Regression notice (edited)");
  [s, j] = await call(E, "GET", P);
  check("Draft is not in the employee's feed", s === 200 && !j.data.some((a) => a.id === d1));
  [s] = await call(E, "GET", `${P}/${d1}`);
  check("Employee can't open a draft", s === 404);
  [s, j] = await call(H, "POST", `${P}/${d1}/send`);
  check("Send resolves to 2 recipients", s === 200 && j.data.recipients === 2, j?.message);
  [s, j] = await call(H, "POST", `${P}/${d1}/send`);
  check("Can't be sent twice", s === 409, j?.message);
  [s, j] = await call(H, "PUT", `${P}/${d1}`, { title: "Changed after sending" });
  check("Sent announcement text can't be edited", s === 409);
  [s, j] = await call(E, "GET", P);
  const mine = j.data.find((a) => a.id === d1);
  check("Employee feed shows it, unread, with sender", !!mine && mine.read === false && !!mine.sender?.name && mine.message.includes("\n"));
  check("Feed hides recipient list from staff", mine && mine.recipientIds === undefined);
  [s, j] = await call(A, "GET", `${P}?mine=true`);
  check("Admin (not addressed) doesn't see it in their own feed", !j.data.some((a) => a.id === d1));
  [s, j] = await call(E, "GET", "/api/notifications");
  const note = (j?.data ?? []).find((n) => n.actionUrl === `/announcements?open=${d1}`);
  check("Employee got a notification linking to it", !!note);
  [s] = await call(A, "GET", `${P}/${d1}`);
  check("Admin can open any announcement", s === 200);

  // ── Pinned banner + read ──
  [s, j] = await call(H, "POST", P, { title: "Regression banner", message: "First line\nmore", category: "Event", pinned: true, audience: { employeeIds: [E.id] }, action: "send" });
  check("Pinned announcement sent", s === 201 && j.data.status === "SENT" && j.data.pinned, j?.message);
  const b1 = j.data.id; created.push(b1);
  [s, j] = await call(E, "GET", `${P}/banner`);
  check("Banner shows it to the recipient", s === 200 && j.data?.id === b1);
  [s] = await call(M, "POST", `${P}/${b1}/read`);
  check("Non-recipient can't mark it read", s === 404);
  [s] = await call(E, "POST", `${P}/${b1}/read`);
  check("Recipient dismisses it", s === 200);
  [s, j] = await call(E, "GET", `${P}/banner`);
  check("Banner gone after dismiss", j.data?.id !== b1);
  [s, j] = await call(A, "GET", `${P}?status=SENT`);
  const row = j.data.find((a) => a.id === b1);
  check("Manage list shows read by 1 of 1", row && row.readCount === 1 && row.recipientCount === 1);
  [s, j] = await call(H, "PUT", `${P}/${b1}`, { pinned: false });
  check("Pin can be turned off after sending", s === 200 && j.data.pinned === false, j?.message);

  // ── Schedule / cancel ──
  [s, j] = await call(H, "POST", P, { title: "Regression scheduled", message: "Later", audience: testOnly, scheduledAt: new Date(Date.now() - 60_000).toISOString(), action: "schedule" });
  check("Past schedule time refused (kept as draft)", s === 400 && /passed/.test(j.message), j?.message);
  if (j?.data?.id) created.push(j.data.id);
  [s, j] = await call(H, "POST", P, { title: "Regression scheduled", message: "Later", audience: testOnly, scheduledAt: new Date(Date.now() + 3600_000).toISOString(), action: "schedule" });
  check("Future schedule → SCHEDULED", s === 201 && j.data.status === "SCHEDULED", j?.message);
  const sc = j.data.id; created.push(sc);
  [s, j] = await call(H, "PUT", `${P}/${sc}`, { message: "Later, edited" });
  check("Editing a scheduled one keeps it scheduled", s === 200 && j.data.status === "SCHEDULED");
  [s, j] = await call(H, "POST", `${P}/${sc}/cancel`);
  check("Scheduled one cancelled", s === 200);
  [s] = await call(H, "POST", `${P}/${sc}/send`);
  check("Cancelled one can't be sent", s === 409);
  [s, j] = await call(H, "POST", P, { title: "Nobody", message: "x", audience: { departments: ["__no_such_department__"] }, action: "send" });
  check("Send to an empty audience refused", s === 400, j?.message);
  [s] = await call(H, "DELETE", `${P}/${b1}`);
  check("HR can't delete a sent announcement", s === 403);

  // ── Template CRUD ──
  [s, j] = await call(H, "POST", `${P}/templates`, { kind: "FESTIVAL", name: "Regression fest", title: "Happy {festival}!", message: "From {firm}", festivalOn: "2026-11-08", theme: "diya" });
  check("Festival template created with a date", s === 201 && j.data.festivalOn === "2026-11-08" && j.data.autoSend === false, j?.message);
  const ft = j.data.id;
  [s, j] = await call(H, "PUT", `${P}/templates/${ft}`, { theme: "sparkly" });
  check("Unknown card style refused", s === 400);
  [s, j] = await call(H, "PUT", `${P}/templates/${ft}`, { festivalOn: "bad" });
  check("Bad festival date refused", s === 400);

  // ── Wishes ──
  [s, j] = await call(H, "GET", `${P}/wishes/today`);
  check("Wishes today lists birthdays/anniversaries/festivals/upcoming", s === 200 && Array.isArray(j.data.birthdays) && Array.isArray(j.data.anniversaries) && Array.isArray(j.data.festivals) && Array.isArray(j.data.upcoming), `date ${j?.data?.date}, ${j?.data?.upcoming?.length} coming up`);
  const bt = tpls.find((t) => t.kind === "BIRTHDAY" && t.isActive);
  const at = tpls.find((t) => t.kind === "ANNIVERSARY" && t.isActive);
  [s, j] = await call(E, "POST", `${P}/wishes/send`, { kind: "BIRTHDAY", employeeId: E.id, templateId: bt.id });
  check("Employee can't send wishes", s === 403);
  [s, j] = await call(H, "POST", `${P}/wishes/send`, { kind: "ANNIVERSARY", employeeId: E.id, templateId: bt.id });
  check("Template kind must match", s === 400, j?.message);
  [s, j] = await call(H, "POST", `${P}/wishes/send`, { kind: "ANNIVERSARY", employeeId: E.id, templateId: at.id });
  check("Anniversary under one year refused", s === 400, j?.message);
  [s, j] = await call(H, "POST", `${P}/wishes/send`, { kind: "BIRTHDAY", employeeId: E.id, templateId: bt.id });
  check("Birthday wish sent", s === 201 && !!j.data.announcementId, j?.message);
  const w1 = j?.data?.announcementId; if (w1) created.push(w1);
  [s, j] = await call(H, "POST", `${P}/wishes/send`, { kind: "BIRTHDAY", employeeId: E.id, templateId: bt.id });
  check("Second birthday wish today → 409", s === 409 && /already been sent/.test(j.message), j?.message);
  [s, j] = await call(E, "GET", `${P}/${w1}`);
  check("Wish is a pinned Birthday announcement with placeholders filled, expiring today", s === 200 && j.data.category === "Birthday" && j.data.pinned && !/\{/.test(j.data.title + j.data.message) && !!j.data.expiresAt && j.data.theme, j?.data?.title);
  [s, j] = await call(E, "GET", "/api/notifications");
  check("Person got a personal notification", (j?.data ?? []).some((n) => n.actionUrl === `/announcements?open=${w1}`));
  [s, j] = await call(H, "POST", `${P}/wishes/send`, { kind: "FESTIVAL", templateId: ft });
  check("Festival wish sent", s === 201, j?.message);
  const w2 = j?.data?.announcementId; if (w2) created.push(w2);
  [s, j] = await call(H, "POST", `${P}/wishes/send`, { kind: "FESTIVAL", templateId: ft });
  check("Second festival wish today → 409", s === 409, j?.message);
  // Clean the wishes up straight away (they address everyone).
  for (const id of [w1, w2].filter(Boolean)) { const [ds] = await call(A, "DELETE", `${P}/${id}`); check("Admin deletes wish announcement (and its log)", ds === 200); created.splice(created.indexOf(id), 1); }
  [s, j] = await call(E, "GET", "/api/notifications");
  check("Wish notification removed with it", !(j?.data ?? []).some((n) => n.actionUrl === `/announcements?open=${w1}`));
  [s] = await call(H, "DELETE", `${P}/templates/${ft}`);
  check("Template deleted", s === 200);
} finally {
  for (const id of created) await call(A, "DELETE", `${P}/${id}`);
  const [, j] = await call(A, "GET", `${P}?q=Regression`);
  for (const a of j?.data ?? []) if (/^Regression|^Nobody/.test(a.title)) await call(A, "DELETE", `${P}/${a.id}`);
  const [, n] = await call(A, "GET", `${P}?q=Nobody`);
  for (const a of n?.data ?? []) if (a.title === "Nobody") await call(A, "DELETE", `${P}/${a.id}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
