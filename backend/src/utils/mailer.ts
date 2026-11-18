import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "../config/db";
import "../config/env"; // loads backend/.env before SMTP_* is read

// Outgoing email over SMTP (Office 365, Gmail, or any mail server). Configure in backend/.env:
//   SMTP_HOST=smtp.office365.com  SMTP_PORT=587  SMTP_SECURE=false
//   SMTP_USER=notifications@asaind.co.in  SMTP_PASS=…  MAIL_FROM="ASA Portal <notifications@asaind.co.in>"
// Every attempt is written to email_logs, and nothing is ever reported as sent unless the server accepted it.

export type MailStatus = "sent" | "failed" | "not_configured";

export interface MailInput {
  to: string | string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  category: string;
  employeeId?: string | null;
}

export interface MailResult {
  status: MailStatus;
  error?: string;
}

function smtpSettings() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = /^(1|true|yes)$/i.test(process.env.SMTP_SECURE ?? "") || port === 465;
  const from = process.env.MAIL_FROM?.trim() || user;
  return { host, port, secure, user, pass, from };
}

export function mailConfigured(): boolean {
  return smtpSettings() !== null;
}

let cached: { key: string; transporter: Transporter } | null = null;
function transporter(s: NonNullable<ReturnType<typeof smtpSettings>>): Transporter {
  const key = `${s.host}:${s.port}:${s.secure}:${s.user}`;
  if (cached?.key !== key) {
    cached = {
      key,
      transporter: nodemailer.createTransport({ host: s.host, port: s.port, secure: s.secure, auth: { user: s.user, pass: s.pass } }),
    };
  }
  return cached.transporter;
}

const list = (v: string | string[] | undefined) => [...new Set((Array.isArray(v) ? v : v ? [v] : []).map((x) => x.trim()).filter(Boolean))];

export async function sendMail(input: MailInput): Promise<MailResult> {
  const to = list(input.to);
  const cc = list(input.cc).filter((x) => !to.includes(x));
  const s = smtpSettings();
  let result: MailResult;
  if (!to.length) {
    result = { status: "failed", error: "No recipient email address." };
  } else if (!s) {
    result = { status: "not_configured", error: "Email isn’t set up yet (SMTP settings missing in backend/.env)." };
  } else {
    try {
      await transporter(s).sendMail({ from: s.from, to, cc: cc.length ? cc : undefined, subject: input.subject, text: input.text, html: input.html });
      result = { status: "sent" };
    } catch (e) {
      result = { status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "The mail server refused the message." };
    }
  }
  try {
    await prisma.emailLog.create({
      data: {
        recipient: [...to, ...cc.map((c) => `cc:${c}`)].join(", ") || "(none)",
        subject: input.subject,
        status: result.status,
        errorMessage: result.error ?? null,
        provider: "smtp",
        category: input.category,
        employeeId: input.employeeId ?? null,
      },
    });
  } catch {
    // Logging must never break the action that sent the mail.
  }
  return result;
}

/** Plain-text body → minimal HTML (paragraphs, links kept as text). */
export function textToHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2937">${esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
}
