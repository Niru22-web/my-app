import { prisma } from "../config/db";

/**
 * ASA MIS logic on portal data.
 *
 * Cost allocation (MIS views employee_monthly_cost / employee_monthly_hours / cost_allocation):
 *   each person's monthly cost is split across clients/projects in proportion to the hours they logged:
 *   allocated = round(cost × project hours / total hours that month, 2).
 * Cost source:
 *   payroll — finalised payroll runs: gross + employer PF + employer ESIC, for people linked to a portal account.
 *   tally   — Tally expense vouchers (head = Expense) whose party is a linked Employee/Consultant (the MIS method).
 * Hours come straight from portal timelogs (by person, client and project — no name matching needed).
 * Reporting dimensions: reporting_map row for the project, else for the client, else the portal record.
 */

export type CostSource = "payroll" | "tally";
export const ymRe = /^\d{4}-(0[1-9]|1[0-2])$/;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function monthBounds(months: string[]) {
  const sorted = [...months].sort();
  const [fy, fm] = sorted[0].split("-").map(Number);
  const [ly, lm] = sorted[sorted.length - 1].split("-").map(Number);
  return { from: new Date(Date.UTC(fy, fm - 1, 1)), to: new Date(Date.UTC(ly, lm, 0, 23, 59, 59, 999)) };
}

const name = (e?: { firstName: string; lastName: string } | null) => (e ? `${e.firstName} ${e.lastName}`.trim() : null);

/** Tally classification for one firm-month range: (entity, month, head) sums plus party (particulars) detail. */
export async function classifiedVouchers(where: { entityIds?: string[]; months?: string[] }) {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (where.entityIds?.length) {
    params.push(where.entityIds);
    conds.push(`v."entityId" = ANY($${params.length})`);
  }
  if (where.months?.length) {
    params.push(where.months);
    conds.push(`to_char(v."date", 'YYYY-MM') = ANY($${params.length})`);
  }
  const sql = `
    SELECT v."entityId" AS "entityId", to_char(v."date", 'YYYY-MM') AS month, COALESCE(h.head, 'Unclassified') AS head,
           v.ledger, v.particulars, l."primaryGroup" AS "primaryGroup", SUM(v.value)::float8 AS value, COUNT(*)::int AS n
    FROM tally_vouchers v
    LEFT JOIN tally_ledgers l ON l."entityId" = v."entityId" AND l."ledgerName" = v.ledger
    LEFT JOIN tally_group_heads h ON h."primaryGroup" = l."primaryGroup"
    ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""}
    GROUP BY 1, 2, 3, 4, 5, 6`;
  return prisma.$queryRawUnsafe<{ entityId: string; month: string | null; head: string; ledger: string; particulars: string | null; primaryGroup: string | null; value: number; n: number }[]>(sql, ...params);
}

interface CostRow {
  employeeId: string | null;
  person: string;
  month: string;
  entityId: string;
  cost: number;
  /** Why a cost can't be tied to a portal person (null = linked). */
  unlinkedReason?: string;
}

/** Monthly cost per person for the months, from the chosen source. */
export async function monthlyCosts(source: CostSource, months: string[], entityId?: string): Promise<CostRow[]> {
  if (source === "payroll") {
    const lines = await prisma.payrollLine.findMany({
      where: { run: { status: "Finalised", month: { in: months }, ...(entityId ? { entityId } : {}) } },
      select: {
        gross: true,
        pfEmployer: true,
        esicEmployer: true,
        run: { select: { month: true, entityId: true } },
        structure: { select: { name: true, employeeId: true, employee: { select: { firstName: true, lastName: true } } } },
      },
    });
    return lines.map((l) => ({
      employeeId: l.structure.employeeId,
      person: name(l.structure.employee) ?? l.structure.name,
      month: l.run.month,
      entityId: l.run.entityId,
      cost: r2(l.gross + l.pfEmployer + l.esicEmployer),
      unlinkedReason: l.structure.employeeId ? undefined : "Salary structure isn’t linked to a portal account",
    }));
  }
  // Tally: Expense-head vouchers whose party is a linked Employee/Consultant (MIS employee_monthly_cost).
  const [rows, links] = await Promise.all([
    classifiedVouchers({ months, entityIds: entityId ? [entityId] : undefined }),
    prisma.tallyPartyLink.findMany({ select: { tallyName: true, employeeId: true, category: true, employee: { select: { firstName: true, lastName: true } } } }),
  ]);
  const byName = new Map(links.map((l) => [l.tallyName.toLowerCase(), l]));
  const acc = new Map<string, CostRow>();
  for (const r of rows) {
    if (r.head !== "Expense" || !r.particulars || !r.month) continue;
    const link = byName.get(r.particulars.toLowerCase());
    if (!link || !["Employee", "Consultant"].includes(link.category)) continue; // not a person's cost (MIS: category filter)
    const key = `${r.entityId}|${r.month}|${r.particulars.toLowerCase()}`;
    const cur = acc.get(key) ?? {
      employeeId: link.employeeId,
      person: name(link.employee) ?? r.particulars,
      month: r.month,
      entityId: r.entityId,
      cost: 0,
      unlinkedReason: link.employeeId ? undefined : "Tally name isn’t linked to a portal account",
    };
    cur.cost += r.value;
    acc.set(key, cur);
  }
  return [...acc.values()].map((c) => ({ ...c, cost: r2(c.cost) }));
}

export interface Dimensions {
  reportingClient: string;
  serviceCategory: string | null;
  verticalHead: string | null;
  partner: string | null;
}

/** Reporting dimensions for clients/projects: project mapping → client mapping → portal record. */
export async function dimensionsLookup() {
  const [maps, projects, clients] = await Promise.all([
    prisma.reportingMap.findMany(),
    prisma.project.findMany({ select: { id: true, name: true, clientId: true, partner: { select: { firstName: true, lastName: true } } } }),
    prisma.client.findMany({ select: { id: true, name: true, partnerId: true } }),
  ]);
  const partnerIds = clients.map((c) => c.partnerId).filter((x): x is string => !!x);
  const partners = new Map(
    (await prisma.employee.findMany({ where: { id: { in: partnerIds } }, select: { id: true, firstName: true, lastName: true } })).map((e) => [e.id, name(e)]),
  );
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const projMap = new Map(projects.map((p) => [p.id, p]));
  const byProject = new Map(maps.filter((m) => m.projectId).map((m) => [m.projectId!, m]));
  const byClient = new Map(maps.filter((m) => !m.projectId).map((m) => [m.clientId, m]));
  return (clientId: string | null, projectId: string | null): Dimensions & { client: string; project: string | null } => {
    const p = projectId ? projMap.get(projectId) : undefined;
    const cid = clientId ?? p?.clientId ?? null;
    const c = cid ? clientMap.get(cid) : undefined;
    const pm = projectId ? byProject.get(projectId) : undefined;
    const cm = cid ? byClient.get(cid) : undefined;
    return {
      client: c?.name ?? "Unknown client",
      project: p?.name ?? null,
      reportingClient: pm?.reportingClientName || cm?.reportingClientName || c?.name || "Unknown client",
      serviceCategory: pm?.serviceCategory || cm?.serviceCategory || null,
      verticalHead: pm?.verticalHead || cm?.verticalHead || null,
      partner: pm?.engagementPartner || cm?.engagementPartner || name(p?.partner ?? null) || (c?.partnerId ? partners.get(c.partnerId) ?? null : null),
    };
  };
}

export interface AllocationRow extends Dimensions {
  month: string;
  employeeId: string;
  person: string;
  clientId: string;
  client: string;
  projectId: string;
  project: string | null;
  hours: number;
  totalHours: number;
  monthCost: number;
  allocated: number;
}

export interface UnallocatedRow {
  month: string;
  person: string;
  employeeId: string | null;
  cost: number;
  reason: string;
}

/** The cost allocation (MIS cost_allocation + unallocated_employee_cost) for months. */
export async function costAllocation(source: CostSource, months: string[], entityId?: string) {
  const costs = await monthlyCosts(source, months, entityId);
  const { from, to } = monthBounds(months);
  const linkedIds = [...new Set(costs.map((c) => c.employeeId).filter((x): x is string => !!x))];
  const logs = linkedIds.length
    ? await prisma.timelog.findMany({ where: { employeeId: { in: linkedIds }, date: { gte: from, lte: to } }, select: { employeeId: true, date: true, hours: true, clientId: true, projectId: true } })
    : [];
  // hours[employee|month] → project rows
  const hours = new Map<string, Map<string, { clientId: string; projectId: string; hours: number }>>();
  for (const l of logs) {
    const month = l.date.toISOString().slice(0, 7);
    if (!months.includes(month)) continue;
    const key = `${l.employeeId}|${month}`;
    const m = hours.get(key) ?? new Map();
    const pk = `${l.clientId}|${l.projectId}`;
    const cur = m.get(pk) ?? { clientId: l.clientId, projectId: l.projectId, hours: 0 };
    cur.hours += Number(l.hours ?? 0);
    m.set(pk, cur);
    hours.set(key, m);
  }
  // A person can be paid by more than one firm in a month: combine their cost for the month.
  const costByPerson = new Map<string, CostRow>();
  const unallocated: UnallocatedRow[] = [];
  for (const c of costs) {
    if (!c.employeeId) {
      unallocated.push({ month: c.month, person: c.person, employeeId: null, cost: c.cost, reason: c.unlinkedReason ?? "Not linked" });
      continue;
    }
    const key = `${c.employeeId}|${c.month}`;
    const cur = costByPerson.get(key);
    costByPerson.set(key, cur ? { ...cur, cost: r2(cur.cost + c.cost) } : { ...c });
  }
  const dims = await dimensionsLookup();
  const rows: AllocationRow[] = [];
  for (const [key, c] of costByPerson) {
    const projects = hours.get(key);
    const total = projects ? [...projects.values()].reduce((a, p) => a + p.hours, 0) : 0;
    if (!projects || total <= 0) {
      unallocated.push({ month: c.month, person: c.person, employeeId: c.employeeId, cost: c.cost, reason: "No timesheet hours logged that month" });
      continue;
    }
    for (const p of projects.values()) {
      const d = dims(p.clientId, p.projectId);
      rows.push({
        month: c.month,
        employeeId: c.employeeId!,
        person: c.person,
        clientId: p.clientId,
        client: d.client,
        projectId: p.projectId,
        project: d.project,
        reportingClient: d.reportingClient,
        serviceCategory: d.serviceCategory,
        verticalHead: d.verticalHead,
        partner: d.partner,
        hours: Math.round(p.hours * 100) / 100,
        totalHours: Math.round(total * 100) / 100,
        monthCost: c.cost,
        allocated: r2((c.cost * p.hours) / total),
      });
    }
  }
  return { rows, unallocated };
}

/** Months that have cost data for a source (finalised payroll runs, or dated Tally vouchers). */
export async function costMonths(source: CostSource): Promise<string[]> {
  if (source === "payroll") {
    const runs = await prisma.payrollRun.findMany({ where: { status: "Finalised" }, select: { month: true }, distinct: ["month"] });
    return runs.map((r) => r.month).sort();
  }
  const rows = await prisma.$queryRawUnsafe<{ m: string }[]>(`SELECT DISTINCT to_char("date", 'YYYY-MM') AS m FROM tally_vouchers WHERE "date" IS NOT NULL ORDER BY 1`);
  return rows.map((r) => r.m);
}

/** Issued-invoice revenue (excl. GST, in INR) per client/project for a month range. */
export async function invoiceRevenue(months: string[]) {
  const { from, to } = monthBounds(months);
  const invoices = await prisma.invoice.findMany({
    where: { issueDate: { gte: from, lte: to }, status: { notIn: ["DRAFT", "CANCELLED"] } },
    select: { issueDate: true, clientId: true, projectId: true, exchangeRate: true, items: { select: { total: true, projectId: true, clientId: true } } },
  });
  const out: { month: string; clientId: string; projectId: string | null; amount: number }[] = [];
  for (const inv of invoices) {
    const month = inv.issueDate.toISOString().slice(0, 7);
    if (!months.includes(month)) continue;
    const rate = inv.exchangeRate && inv.exchangeRate > 0 ? inv.exchangeRate : 1;
    for (const it of inv.items) out.push({ month, clientId: it.clientId ?? inv.clientId, projectId: it.projectId ?? inv.projectId, amount: r2(it.total * rate) });
  }
  return out;
}
