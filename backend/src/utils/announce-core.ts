import { Prisma } from "@prisma/client";
import { prisma } from "../config/db";
import { createNotification } from "./notify";

// ── Shared logic for announcements and birthday / anniversary / festival wishes ──────────────
// Audience rule: within one dimension (e.g. two departments) people match ANY value; across
// dimensions (department AND role) they must match every selected dimension. People picked by
// name are always added. Nothing selected = every active employee.

export const CATEGORIES = ["Announcement", "Festival", "Birthday", "Anniversary", "Policy", "Event"] as const;
export const WISH_KINDS = ["BIRTHDAY", "ANNIVERSARY", "FESTIVAL"] as const;
export const THEMES = ["classic", "confetti", "diya", "floral"] as const;
export const FIRM = "ASA";
/** createdById used for wishes the system sends on its own. */
export const SYSTEM_SENDER = "system";

export type WishKind = (typeof WISH_KINDS)[number];

export interface Audience {
  departments?: string[];
  designations?: string[];
  roles?: string[];
  locations?: string[];
  employeeIds?: string[];
}

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, 500) : [];

/** Cleans whatever the client sent into a well-formed audience (unknown keys dropped). */
export function cleanAudience(raw: unknown): Audience {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const a: Audience = {};
  for (const k of ["departments", "designations", "roles", "locations", "employeeIds"] as const) {
    const l = strList(o[k]);
    if (l.length) a[k] = l;
  }
  return a;
}

export const audienceIsEmpty = (a: Audience) =>
  !a.departments?.length && !a.designations?.length && !a.roles?.length && !a.locations?.length && !a.employeeIds?.length;

export const ACTIVE_WHERE = {
  status: { equals: "active", mode: "insensitive" as const },
  approvalStatus: { not: "REJECTED" },
};

export interface ActivePerson {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  officeEmail: string;
  role: string;
  designation: string;
  department: string;
  profileImage: string | null;
  location: string | null;
}

export async function activePeople(): Promise<ActivePerson[]> {
  const rows = await prisma.employee.findMany({
    where: ACTIVE_WHERE,
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      officeEmail: true,
      role: true,
      designation: true,
      department: true,
      profileImage: true,
      locationMaster: { select: { name: true } },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  return rows.map(({ locationMaster, ...r }) => ({ ...r, location: locationMaster?.name ?? null }));
}

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Active people the audience addresses (see rule at the top of the file). */
export function matchAudience(people: ActivePerson[], a: Audience): ActivePerson[] {
  if (audienceIsEmpty(a)) return people;
  const dims: [keyof ActivePerson, string[] | undefined][] = [
    ["department", a.departments],
    ["designation", a.designations],
    ["role", a.roles],
    ["location", a.locations],
  ];
  const active = dims.filter(([, v]) => v?.length) as [keyof ActivePerson, string[]][];
  const explicit = new Set(a.employeeIds ?? []);
  return people.filter((p) => {
    if (explicit.has(p.id)) return true;
    if (!active.length) return false;
    return active.every(([field, values]) => values.some((v) => norm(v) === norm(p[field] as string | null)));
  });
}

export async function resolveAudience(a: Audience): Promise<ActivePerson[]> {
  return matchAudience(await activePeople(), a);
}

// ── IST calendar helpers ──────────────────────────────────────────────────────
const IST_MS = 330 * 60_000;
export const istYmd = (t: Date = new Date()) => new Date(t.getTime() + IST_MS).toISOString().slice(0, 10);
/** Minutes since IST midnight. */
export const istMinutes = (t: Date = new Date()) => {
  const d = new Date(t.getTime() + IST_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
/** The instant the given IST day ends (next IST midnight). */
export const istEndOfDay = (ymd: string) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() + 86_400_000 - IST_MS);
export const addDaysYmd = (ymd: string, n: number) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Stored dates (dob/doj) are calendar days at UTC midnight — read the date part only. */
const dateYmd = (d: Date) => d.toISOString().slice(0, 10);

/** Whether a yearly date (birthday / joining day) falls on `ymd`. 29 Feb is celebrated on 28 Feb in other years. */
export function isYearlyOn(source: Date, ymd: string): boolean {
  const md = dateYmd(source).slice(5);
  const y = Number(ymd.slice(0, 4));
  const target = ymd.slice(5);
  if (md === "02-29" && !isLeap(y)) return target === "02-28";
  return md === target;
}

export const yearsBetween = (from: Date, ymd: string) => Number(ymd.slice(0, 4)) - Number(dateYmd(from).slice(0, 4));

// ── Placeholders ──────────────────────────────────────────────────────────────
export interface FillVars {
  name?: string;
  firstName?: string;
  years?: number | string;
  festival?: string;
}
export function fillPlaceholders(text: string, v: FillVars): string {
  return text
    .replace(/\{name\}/g, v.name ?? "everyone")
    .replace(/\{firstName\}/g, v.firstName ?? v.name ?? "everyone")
    .replace(/\{years\}/g, v.years != null ? String(v.years) : "")
    .replace(/\{festival\}/g, v.festival ?? "")
    .replace(/\{firm\}/g, FIRM);
}

// ── Default templates (seeded once when the table is empty) ───────────────────
export const DEFAULT_TEMPLATES: { kind: WishKind; name: string; title: string; message: string; theme: string }[] = [
  {
    kind: "BIRTHDAY",
    name: "Birthday",
    title: "Happy Birthday, {firstName}! 🎂",
    message: "Wishing you a very happy birthday, {name}!\nMay the year ahead bring you good health, happiness and success.\nWarm wishes from everyone at {firm}.",
    theme: "confetti",
  },
  {
    kind: "ANNIVERSARY",
    name: "Work anniversary",
    title: "Happy work anniversary, {firstName}!",
    message: "Congratulations on completing {years} years with {firm}, {name}!\nThank you for your hard work and commitment. Here's to many more years together.",
    theme: "classic",
  },
  ...(
    [
      ["Diwali", "Happy Diwali! 🪔", "Wishing you and your family a joyful and prosperous Diwali.\nMay the festival of lights brighten every corner of your life. — Team {firm}", "diya"],
      ["Holi", "Happy Holi! 🎨", "May this Holi fill your life with colour, joy and laughter.\nWarm wishes from everyone at {firm}.", "confetti"],
      ["Ganesh Chaturthi", "Happy Ganesh Chaturthi! 🙏", "May Lord Ganesha remove all obstacles and bless you with wisdom and success.\nWarm wishes from {firm}.", "floral"],
      ["Navratri / Dussehra", "Happy Navratri and Dussehra!", "May the festive season bring you strength, joy and the victory of good over evil.\nWarm wishes from {firm}.", "floral"],
      ["Christmas", "Merry Christmas! 🎄", "Wishing you a merry Christmas filled with peace, warmth and time with loved ones.\n— Team {firm}", "classic"],
      ["New Year", "Happy New Year! 🎉", "Thank you for a wonderful year together.\nWishing you good health, happiness and success in the year ahead. — Team {firm}", "confetti"],
      ["Eid", "Eid Mubarak! 🌙", "May this Eid bring peace, happiness and prosperity to you and your family.\nWarm wishes from {firm}.", "classic"],
      ["Makar Sankranti / Pongal", "Happy Makar Sankranti and Pongal! 🪁", "May the harvest season bring you abundance, warmth and new beginnings.\nWarm wishes from {firm}.", "floral"],
      ["Independence Day", "Happy Independence Day! 🇮🇳", "Let us celebrate the spirit of freedom and pride in our nation.\nJai Hind! — Team {firm}", "classic"],
      ["Republic Day", "Happy Republic Day! 🇮🇳", "Celebrating the values of our Constitution and the strength of our democracy.\nWarm wishes from {firm}.", "classic"],
    ] as const
  ).map(([name, title, message, theme]) => ({ kind: "FESTIVAL" as const, name, title, message, theme })),
];

let seeding: Promise<void> | null = null;
/** Adds the default templates once, the first time the template list is opened. */
export function seedTemplatesIfEmpty(createdById: string): Promise<void> {
  seeding ??= (async () => {
    try {
      // An advisory lock keeps two API processes from seeding at the same time.
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(84211907)`;
        if ((await tx.wishTemplate.count()) > 0) return;
        await tx.wishTemplate.createMany({ data: DEFAULT_TEMPLATES.map((t) => ({ ...t, autoSend: false, isActive: true, festivalOn: null, createdById })) });
      });
    } finally {
      seeding = null;
    }
  })();
  return seeding;
}

// ── Sending ───────────────────────────────────────────────────────────────────
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function notifyAll(userIds: string[], title: string, message: string, announcementId: string) {
  const preview = message.length > 180 ? `${message.slice(0, 177)}…` : message;
  for (let i = 0; i < userIds.length; i += 20) {
    await Promise.all(
      userIds.slice(i, i + 20).map((userId) =>
        createNotification({
          userId,
          title,
          message: preview,
          type: "announcement",
          module: "Announcements",
          relatedId: announcementId,
          actionUrl: `/announcements?open=${announcementId}`,
        }),
      ),
    );
  }
}

/**
 * Sends a draft or scheduled announcement now: resolves the audience, marks it SENT (only once — the
 * status check is part of the update) and notifies every recipient.
 */
export async function sendAnnouncement(id: string): Promise<{ recipients: number }> {
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, "Announcement not found.");
  if (a.status === "SENT") throw new HttpError(409, "This announcement has already been sent.");
  if (a.status === "CANCELLED") throw new HttpError(409, "This announcement was cancelled. Duplicate it to send it again.");
  const people = await resolveAudience(cleanAudience(a.audience));
  if (!people.length) throw new HttpError(400, "No active staff match the selected audience.");
  const recipientIds = people.map((p) => p.id);
  const done = await prisma.announcement.updateMany({
    where: { id, status: { in: ["DRAFT", "SCHEDULED"] } },
    data: { status: "SENT", sentAt: new Date(), recipientIds },
  });
  if (done.count !== 1) throw new HttpError(409, "This announcement has already been sent or cancelled.");
  await notifyAll(recipientIds, `📢 ${a.title}`, a.message, id);
  return { recipients: recipientIds.length };
}

// ── Wishes ────────────────────────────────────────────────────────────────────
const KIND_CATEGORY: Record<WishKind, string> = { BIRTHDAY: "Birthday", ANNIVERSARY: "Anniversary", FESTIVAL: "Festival" };

/** Log key for a festival (one row per festival template per day; employeeId can't be NULL for the unique check). */
export const festivalKey = (templateId: string) => `festival:${templateId}`;

export interface WishPerson {
  id: string;
  employeeId: string;
  name: string;
  firstName: string;
  department: string;
  designation: string;
  profileImage: string | null;
  dob: string | null;
  doj: string | null;
}

/** Active staff with their birthday and joining dates. */
export async function peopleWithDates(): Promise<WishPerson[]> {
  const rows = await prisma.employee.findMany({
    where: ACTIVE_WHERE,
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      department: true,
      designation: true,
      profileImage: true,
      profile: { select: { dob: true, doj: true } },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    name: fullName(r),
    firstName: r.firstName,
    department: r.department,
    designation: r.designation,
    profileImage: r.profileImage,
    dob: r.profile?.dob ? dateYmd(r.profile.dob) : null,
    doj: r.profile?.doj ? dateYmd(r.profile.doj) : null,
  }));
}

/**
 * Sends one wish: a firm-wide announcement (pinned until the end of the IST day) and, for birthdays and
 * anniversaries, a personal notification. The wish log row is written in the same transaction, so the same
 * wish can never go out twice — even with two API processes.
 */
export async function sendWish(opts: { kind: WishKind; templateId: string; employeeId?: string | null; sentById: string | null; ymd?: string }) {
  const ymd = opts.ymd ?? istYmd();
  const tpl = await prisma.wishTemplate.findUnique({ where: { id: opts.templateId } });
  if (!tpl) throw new HttpError(404, "Template not found.");
  if (tpl.kind !== opts.kind) throw new HttpError(400, "That template is for a different kind of wish.");
  if (!tpl.isActive) throw new HttpError(400, "That template is switched off. Turn it on first.");

  let vars: FillVars = { festival: tpl.name };
  let logEmployee: string;
  let person: WishPerson | undefined;
  if (opts.kind === "FESTIVAL") {
    logEmployee = festivalKey(tpl.id);
  } else {
    if (!opts.employeeId) throw new HttpError(400, "Choose the person to wish.");
    person = (await peopleWithDates()).find((p) => p.id === opts.employeeId);
    if (!person) throw new HttpError(404, "That person isn't an active employee.");
    let years: number | undefined;
    if (opts.kind === "ANNIVERSARY") {
      if (!person.doj) throw new HttpError(400, `${person.name} has no joining date on record.`);
      years = yearsBetween(new Date(`${person.doj}T00:00:00Z`), ymd);
      if (years < 1) throw new HttpError(400, `${person.name} hasn't completed a year yet.`);
    }
    vars = { name: person.name, firstName: person.firstName, years, festival: tpl.name };
    logEmployee = person.id;
  }

  const title = fillPlaceholders(tpl.title, vars).slice(0, 200);
  const message = fillPlaceholders(tpl.message, vars);
  const recipients = (await activePeople()).map((p) => p.id);
  const now = new Date();

  let announcementId: string;
  try {
    announcementId = await prisma.$transaction(async (tx) => {
      const log = await tx.wishLog.create({
        data: { kind: opts.kind, templateId: tpl.id, employeeId: logEmployee, forDate: ymd, sentById: opts.sentById },
      });
      const a = await tx.announcement.create({
        data: {
          title,
          message,
          category: KIND_CATEGORY[opts.kind],
          audience: {},
          pinned: true,
          status: "SENT",
          sentAt: now,
          expiresAt: istEndOfDay(ymd),
          recipientIds: recipients,
          templateId: tpl.id,
          createdById: opts.sentById ?? SYSTEM_SENDER,
        },
      });
      await tx.wishLog.update({ where: { id: log.id }, data: { announcementId: a.id } });
      return a.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const who = person ? `${person.name}'s ${opts.kind === "BIRTHDAY" ? "birthday" : "work anniversary"}` : tpl.name;
      throw new HttpError(409, `Wishes for ${who} have already been sent today.`);
    }
    throw e;
  }

  if (person) {
    await createNotification({
      userId: person.id,
      title,
      message: message.length > 180 ? `${message.slice(0, 177)}…` : message,
      type: "announcement",
      module: "Announcements",
      relatedId: announcementId,
      actionUrl: `/announcements?open=${announcementId}`,
    });
  }
  return { announcementId, recipients: recipients.length, title };
}

// ── Background jobs ───────────────────────────────────────────────────────────
const AUTO_AFTER_MIN = 9 * 60; // 09:00 IST

type Log = { error: (o: unknown, msg?: string) => void; info: (o: unknown, msg?: string) => void };

/** One pass of the announcements job. Safe to run repeatedly and from more than one process. */
export async function runAnnouncementJobs(log: Log) {
  // 1. Scheduled announcements that are due.
  const due = await prisma.announcement.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } }, select: { id: true } });
  for (const { id } of due) {
    try {
      const r = await sendAnnouncement(id);
      log.info({ id, recipients: r.recipients }, "Scheduled announcement sent");
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) continue; // another process got there first
      if (e instanceof HttpError && e.status === 400) {
        // Nobody to send to (everyone left). Cancel it so it doesn't retry forever.
        await prisma.announcement.updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "CANCELLED" } });
        log.error({ id, err: e.message }, "Scheduled announcement cancelled — no recipients");
        continue;
      }
      log.error({ id, err: (e as Error).message }, "Scheduled announcement failed");
    }
  }

  // 2 & 3. Automatic wishes, only after 09:00 IST.
  if (istMinutes() < AUTO_AFTER_MIN) return;
  const ymd = istYmd();
  const templates = await prisma.wishTemplate.findMany({ where: { autoSend: true, isActive: true }, orderBy: { updatedAt: "desc" } });
  if (!templates.length) return;
  const sent = new Set((await prisma.wishLog.findMany({ where: { forDate: ymd }, select: { kind: true, employeeId: true } })).map((l) => `${l.kind}|${l.employeeId}`));
  const attempt = async (kind: WishKind, templateId: string, employeeId: string | null) => {
    try {
      await sendWish({ kind, templateId, employeeId, sentById: null, ymd });
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) return;
      log.error({ kind, employeeId, err: (e as Error).message }, "Automatic wish failed");
    }
  };

  const bday = templates.find((t) => t.kind === "BIRTHDAY");
  const anniv = templates.find((t) => t.kind === "ANNIVERSARY");
  if (bday || anniv) {
    for (const p of await peopleWithDates()) {
      if (bday && p.dob && isYearlyOn(new Date(`${p.dob}T00:00:00Z`), ymd) && !sent.has(`BIRTHDAY|${p.id}`)) await attempt("BIRTHDAY", bday.id, p.id);
      if (anniv && p.doj && isYearlyOn(new Date(`${p.doj}T00:00:00Z`), ymd) && yearsBetween(new Date(`${p.doj}T00:00:00Z`), ymd) >= 1 && !sent.has(`ANNIVERSARY|${p.id}`))
        await attempt("ANNIVERSARY", anniv.id, p.id);
    }
  }
  for (const f of templates.filter((t) => t.kind === "FESTIVAL" && t.festivalOn && dateYmd(t.festivalOn) === ymd)) {
    if (!sent.has(`FESTIVAL|${festivalKey(f.id)}`)) await attempt("FESTIVAL", f.id, null);
  }
}
