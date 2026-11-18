import { fileURLToPath as __toPath } from "url";
const __ROOT = __toPath(new URL("../../", import.meta.url)).split(String.fromCharCode(92)).join("/").replace(/\/$/, "");
// Import service: templates, check, all-or-nothing, import, duplicate skip. Test records only (cleaned up).
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(__ROOT + "/backend/package.json");
const ExcelJS = require("exceljs");
const env = Object.fromEntries(fs.readFileSync(__ROOT + "/_local/test-accounts.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const B = "http://127.0.0.1:5000";
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const login = async (w) => { const j = await (await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: env[w + "_EMAIL"], password: env.TEST_PASSWORD }) })).json(); return { t: j.token, id: j.user?.id }; };
const A = await login("ADMIN"), E = await login("EMPLOYEE");

for (const k of ["employees", "clients", "projects", "jobs", "assets", "vendors", "holidays"]) {
  const r = await fetch(`${B}/api/imports/${k}/template`, { headers: { authorization: "Bearer " + A.t } });
  const buf = Buffer.from(await r.arrayBuffer());
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  check(`${k} template is a real workbook with a How-to sheet`, r.status === 200 && wb.worksheets.length === 2 && wb.worksheets[1].name === "How to fill", `${wb.worksheets[0]?.getRow(1).values.slice(1, 4).join(" | ")}`);
}

const book = async (header, rows) => { const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("x"); ws.addRow(header); rows.forEach((r) => ws.addRow(r)); return Buffer.from(await wb.xlsx.writeBuffer()); };
const send = async (t, kind, mode, buf, name = "f.xlsx") => { const fd = new FormData(); fd.append("file", new Blob([buf]), name); const r = await fetch(`${B}/api/imports/${kind}?mode=${mode}`, { method: "POST", headers: { authorization: "Bearer " + t }, body: fd }); return [r.status, await r.json()]; };

const header = ["Company *", "Vendor name *", "Contact person", "Email", "Phone", "GSTIN", "Address"];
const bad = await book(header, [["ZZ Test Vendor A (local)", "Alpha", "", "not-an-email", "", "", ""], ["ZZ Test Vendor B (local)", "Beta", "", "b@example.com", "", "", ""]]);
let [s, j] = await send(A.t, "vendors", "check", bad);
check("Check finds the bad email row", s === 200 && j.summary.errors === 1 && j.summary.ready === 1, j.message);
[s, j] = await send(A.t, "vendors", "import", bad);
check("Import with an error saves nothing", s === 400, j.message);
const vendorsBefore = (await (await fetch(`${B}/api/assets/vendors`, { headers: { authorization: "Bearer " + A.t } })).json()).data.length;

const good = await book(header, [["ZZ Test Vendor A (local)", "Alpha", "", "a@example.com", "", "", ""], ["ZZ Test Vendor B (local)", "Beta", "", "b@example.com", "", "", ""]]);
[s, j] = await send(A.t, "vendors", "import", good);
check("Clean file imports", s === 200 && j.summary.imported === 2, j.message);
[s, j] = await send(A.t, "vendors", "check", good);
check("Re-importing skips what already exists", j.summary.skipped === 2 && j.summary.ready === 0, j.message);
const csv = Buffer.from("\uFEFFCompany,Vendor name\nZZ Test Vendor C (local),Gamma\n");
[s, j] = await send(A.t, "vendors", "check", csv, "v.csv");
check("CSV works too", j.summary?.ready === 1, j.message);
[s, j] = await send(E.t, "vendors", "check", good);
check("Employee can't import", s === 403);
[s, j] = await send(A.t, "clients", "check", await book(["Client name *", "GSTIN"], [["ZZ Import Client (local)", "BADGSTIN"]]));
check("Client GSTIN is validated", j.summary?.errors === 1, j.rows?.[0]?.message);
[s, j] = await send(A.t, "jobs", "check", await book(["Job name *", "Project code *"], [["Fieldwork", "NOPE999"]]));
check("Job with unknown project is flagged", j.summary?.errors === 1, j.rows?.[0]?.message);
[s, j] = await send(A.t, "vendors", "check", await book(["Something else"], [["x"]]));
check("Wrong columns are explained", s === 400 && /Missing column/.test(j.message), j.message);

// clean up test vendors
const vendors = (await (await fetch(`${B}/api/assets/vendors`, { headers: { authorization: "Bearer " + A.t } })).json()).data;
let removed = 0;
for (const v of vendors.filter((v) => /^ZZ Test Vendor/.test(v.company))) {
  const r = await fetch(`${B}/api/assets/vendors/${v.id}`, { method: "DELETE", headers: { authorization: "Bearer " + A.t } });
  if (r.ok) removed++;
}
console.log(`   cleaned up ${removed} test vendor(s); vendors before import: ${vendorsBefore}`);
console.log(`\n${pass} passed, ${fail} failed`);
