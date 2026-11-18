import { fileURLToPath as __toPath } from "url";
const __ROOT = __toPath(new URL("../../", import.meta.url)).split(String.fromCharCode(92)).join("/").replace(/\/$/, "");
// Calls every parameter-free GET route as each test role and reports server errors, not-founds and slow answers.
// Read-only. Usage: node backend/tests/api-sweep.mjs
import fs from "fs";
import path from "path";
const ROOT = __ROOT;
const env = Object.fromEntries(fs.readFileSync(`${ROOT}/_local/test-accounts.env`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const B = "http://127.0.0.1:5000";

// Collect GET routes from the backend source
const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".ts") && files.push(path.join(d, e.name))));
walk(`${ROOT}/backend/src/modules`);
const routes = new Set();
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/app\.get\(\s*["'`](\/api\/[^"'`]+)["'`]/g)) if (!m[1].includes(":") && !m[1].includes("*")) routes.add(m[1]);
}
const SKIP = new Set(["/api/auth/logout"]);
const list = [...routes].filter((r) => !SKIP.has(r)).sort();

const roles = ["ADMIN", "HR", "IT", "MANAGER", "PARTNER", "EMPLOYEE", "ACCOUNTANT"];
const problems = [];
let calls = 0;
for (const role of roles) {
  const j = await (await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: env[role + "_EMAIL"], password: env.TEST_PASSWORD }) })).json();
  if (!j.token) { problems.push({ role, route: "LOGIN", status: j.message }); continue; }
  for (const r of list) {
    const t0 = Date.now();
    let status = 0, body = "";
    try {
      const res = await fetch(B + r, { headers: { authorization: "Bearer " + j.token } });
      status = res.status;
      body = (await res.text()).slice(0, 200);
    } catch (e) { status = -1; body = String(e); }
    calls++;
    const ms = Date.now() - t0;
    if (status >= 500 || status === 404 || status === -1 || (status === 400 && !/required|choose|missing|invalid|must/i.test(body))) problems.push({ role, route: r, status, body: body.replace(/\s+/g, " ").slice(0, 140) });
    else if (ms > 3000) problems.push({ role, route: r, status, body: `slow: ${ms} ms` });
  }
}
console.log(`${list.length} routes × ${roles.length} roles = ${calls} calls`);
const byRoute = new Map();
for (const p of problems) {
  const k = `${p.route} → ${p.status}`;
  byRoute.set(k, { ...(byRoute.get(k) ?? { roles: [], body: p.body }), roles: [...(byRoute.get(k)?.roles ?? []), p.role] });
}
for (const [k, v] of byRoute) console.log(`${k}  [${v.roles.join(",")}]  ${v.body ?? ""}`);
console.log(problems.length ? `\n${byRoute.size} problem route(s)` : "\nNo problems");
