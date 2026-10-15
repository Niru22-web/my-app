// Accounts end-to-end on the local test entity + a test client. Local API only.
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync("C:/Users/SHIVA/Downloads/WebApp/_local/test-accounts.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const B = "http://127.0.0.1:5000";
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const login = async (w) => { const j = await (await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: env[w + "_EMAIL"], password: env.TEST_PASSWORD }) })).json(); return { t: j.token, id: j.user?.id }; };
const call = async (t, m, p, b) => { const r = await fetch(B + p, { method: m, headers: { authorization: "Bearer " + t, ...(b ? { "content-type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch {} return [r.status, j]; };

const C = await login("ACCOUNTANT"), A = await login("ADMIN");
const entity = (await call(C.t, "GET", "/api/masters/entities?status=all"))[1].data.find((e) => /test/i.test(e.name));
check("Test entity found", !!entity, entity?.name);

// Test clients: same state (MH) and other state (KA via GSTIN)
const mk = async (name, extra) => {
  const all = (await call(A.t, "GET", "/api/clients"))[1].data;
  const hit = all.find((c) => c.name === name);
  if (hit) return hit;
  return (await call(A.t, "POST", "/api/clients", { name, alias: name.slice(0, 10), pan: "", country: "India", status: "Active", ...extra }))[1].data;
};
const local = await mk("ZZ Test Client Mumbai (local)", { state: "Maharashtra", gstStatus: "No" });
const other = await mk("ZZ Test Client Bengaluru (local)", { state: "Karnataka", gstStatus: "Yes", gstin: "29ABCDE1234F1Z5" });

// Start clean: remove unmatched test bank lines left by earlier runs (test entity only).
for (const t of (await call(C.t, "GET", `/api/accounts/transactions?entityId=${entity.id}&status=UNMAPPED`))[1].data ?? []) await call(C.t, "DELETE", `/api/accounts/transactions/${t.id}`);
// place of supply
let [s, j] = await call(C.t, "GET", `/api/accounts/place-of-supply?entityId=${entity.id}&clientId=${other.id}`);
check("Bengaluru client = inter-state", j.data?.supplyType === "INTER", j.data?.label);
[s, j] = await call(C.t, "GET", `/api/accounts/place-of-supply?entityId=${entity.id}&clientId=${local.id}`);
check("Mumbai unregistered client = intra-state by address state", j.data?.supplyType === "INTRA", j.data?.label);

// draft → issue
[s, j] = await call(C.t, "POST", "/api/accounts/invoices", { entityId: entity.id, clientId: other.id, currency: "INR", exchangeRate: 1, items: [{ description: "Statutory audit fee", sacCode: "998221", quantity: 1, unitPrice: 100000, gstRate: 18 }] });
const inv = j.data;
check("Draft created with temporary reference", s === 201 && inv.invoiceNumber.startsWith("DRAFT-") && inv.items[0].igst === 18000, inv?.invoiceNumber);
[s, j] = await call(C.t, "POST", `/api/accounts/invoices/${inv.id}/issue`, {});
const issued = j.data;
check("Issue gives a GST series number ≤16 chars", s === 200 && /^[A-Z0-9-]+\/\d{2,4}-?\d{0,2}\/\d{4}$/.test(issued.invoiceNumber) && issued.invoiceNumber.length <= 16, `${s} ${issued?.invoiceNumber ?? j.message}`);
[s, j] = await call(C.t, "PUT", `/api/accounts/invoices/${inv.id}`, { items: [{ description: "x", quantity: 1, unitPrice: 1, gstRate: 0 }] });
check("Issued invoice can't be edited", s === 409, j.message);
[s, j] = await call(C.t, "PUT", `/api/accounts/invoices/${inv.id}`, { udin: "26123456ABCDEF1234" });
check("UDIN can still be added after issue", s === 200);
let led = (await call(C.t, "GET", `/api/accounts/ledgers/client/${other.id}`))[1];
check("Issue posted a client ledger debit", led.data.some((l) => l.referenceId === inv.id && l.debit === 118000));

// receipt with TDS: 100000 net + 10000 TDS on 118000 → part paid, due 8000
[s, j] = await call(C.t, "POST", "/api/accounts/receipts", { clientId: other.id, entityId: entity.id, amount: 100000, tdsAmount: 10000, tdsSection: "194J", currency: "INR", exchangeRate: 1, receiptDate: "2026-10-14", paymentMode: "NEFT", referenceNumber: "UTRTEST1", invoiceId: inv.id });
const rc = j.data;
check("Receipt numbered in entity series", s === 201 && /-RC\//.test(rc.receiptNumber), rc?.receiptNumber ?? j?.message);
let one = (await call(C.t, "GET", `/api/accounts/invoices/${inv.id}`))[1].data;
check("Cash + TDS reduce the balance (due 8000, part paid)", one.balanceDue === 8000 && one.status === "PARTIALLY_PAID", `${one.balanceDue} ${one.status}`);
[s, j] = await call(C.t, "POST", `/api/accounts/invoices/${inv.id}/cancel`, { reason: "test" });
check("Can't cancel an invoice with money received", s === 400, j.message);

// credit note for the rest: 8000 total = 6779.66 taxable at 18%
[s, j] = await call(C.t, "POST", `/api/accounts/invoices/${inv.id}/credit-notes`, { amount: 6779.66, reason: "Fee concession" });
check("Credit note issued with its own series", s === 201 && /-CN\//.test(j.data?.number) && j.data.igst > 0, j.data?.number ?? j.message);
one = (await call(C.t, "GET", `/api/accounts/invoices/${inv.id}`))[1].data;
check("Credit note settles the invoice", one.status === "PAID" && one.balanceDue === 0, `${one.status} ${one.balanceDue}`);

// reverse receipt → reopens
[s, j] = await call(C.t, "POST", `/api/accounts/receipts/${rc.id}/reverse`, { reason: "Cheque bounced (test)" });
one = (await call(C.t, "GET", `/api/accounts/invoices/${inv.id}`))[1].data;
check("Reversing the receipt reopens the invoice", s === 200 && one.balanceDue === 110000 && one.status === "PARTIALLY_PAID", `${one.status} ${one.balanceDue}`);
[s] = await call(C.t, "POST", `/api/accounts/receipts/${rc.id}/reverse`, { reason: "again" });
check("Can't reverse twice", s === 400);

// bank: import twice → duplicates skipped; auto-match only suggests; confirm applies; unmatch undoes
const run = Date.now().toString(36).toUpperCase();
const lines = [{ date: "2026-10-14", description: `NEFT ${issued.invoiceNumber} ZZ TEST CLIENT BENGALURU`, type: "CREDIT", amount: 110000 }, { date: "2026-10-14", description: `Random credit no reference ${run}`, type: "CREDIT", amount: 110000 }];
[s, j] = await call(C.t, "POST", "/api/accounts/bank-statements/import", { entityId: entity.id, statements: lines });
const [, j2] = await call(C.t, "POST", "/api/accounts/bank-statements/import", { entityId: entity.id, statements: lines });
check("Re-importing the same statement adds nothing", j.count === 2 && j2.count === 0 && j2.duplicates === 2, `${j.count}/${j2.count}`);
[s, j] = await call(C.t, "POST", "/api/accounts/bank-statements/auto-match", { entityId: entity.id });
const sug = j.suggestions ?? [];
const txns = (await call(C.t, "GET", `/api/accounts/transactions?entityId=${entity.id}`))[1].data;
const withRef = txns.find((t) => t.description.includes(issued.invoiceNumber));
const noRef = txns.find((t) => t.description.startsWith("Random credit"));
check("Auto-match suggests only the line naming the invoice", sug.some((x) => x.transactionId === withRef.id) && !sug.some((x) => x.transactionId === noRef.id), JSON.stringify(sug.map((x) => x.reason)));
check("Auto-match changes nothing by itself", withRef.mappedStatus === "UNMAPPED");
[s, j] = await call(C.t, "POST", "/api/accounts/bank-statements/confirm", { matches: sug.filter((x) => x.transactionId === withRef.id) });
one = (await call(C.t, "GET", `/api/accounts/invoices/${inv.id}`))[1].data;
check("Confirming the match records the receipt", j.matchedCount === 1 && one.balanceDue === 0, `${j.matchedCount} ${one.balanceDue}`);
[s, j] = await call(C.t, "PUT", `/api/accounts/transactions/${withRef.id}/reconcile`, { mappedStatus: "UNMAPPED", reason: "test" });
one = (await call(C.t, "GET", `/api/accounts/invoices/${inv.id}`))[1].data;
check("Un-matching reverses that receipt", s === 200 && one.balanceDue === 110000, `${s} ${one.balanceDue} ${j?.message ?? ""}`);
[s, j] = await call(C.t, "PUT", `/api/accounts/transactions/${noRef.id}/reconcile`, { invoiceId: inv.id });
one = (await call(C.t, "GET", `/api/accounts/invoices/${inv.id}`))[1].data;
check("Manual match settles it again", s === 200 && one.balanceDue === 0, `${s} ${one.balanceDue}`);

// ledger opening balance
led = (await call(C.t, "GET", `/api/accounts/ledgers/client/${other.id}?from=2026-10-15`))[1];
check("Statement from a later date carries an opening balance", typeof led.opening === "number" && led.closing === led.opening + led.data.reduce((x, r) => x + r.debit - r.credit, 0), `${led.opening} → ${led.closing}`);
const full = (await call(C.t, "GET", `/api/accounts/ledgers/client/${other.id}`))[1];
const owed = ((await call(C.t, "GET", `/api/accounts/invoices?clientId=${other.id}`))[1].data ?? []).reduce((x, i) => x + i.balanceDue * (i.exchangeRate || 1), 0);
const adv = ((await call(C.t, "GET", `/api/accounts/receipts?clientId=${other.id}`))[1].data ?? []).reduce((x, rc) => x + rc.unapplied * (rc.exchangeRate || 1), 0);
check("Client ledger balance = invoices still owed − advances held", Math.abs(full.closing - (owed - adv)) < 0.01, `ledger ${full.closing} vs owed ${owed} − advance ${adv}`);

// series
[s, j] = await call(C.t, "GET", "/api/accounts/series");
check("Series lists next numbers", s === 200 && j.data.some((x) => x.entityId === entity.id && x.nextInvoice), JSON.stringify(j.data.find((x) => x.entityId === entity.id)));
[s, j] = await call(await (async () => (await login("EMPLOYEE")).t)(), "GET", "/api/accounts/invoices");
check("Employee can't open accounts", s === 403);
console.log(`\n${pass} passed, ${fail} failed`);
