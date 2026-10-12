// ============================================================
// Compliance Mailer — Branded HTML Email Templates
// ============================================================

import { sendEmail } from '../../services/email.service';
import { EmailTemplateData, RiskLevel } from './compliance.types';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://timesheet.asaind.co.in';

const riskBadge = (level: RiskLevel) => {
  const styles: Record<RiskLevel, string> = {
    healthy:  'background:#dcfce7;color:#166534;',
    warning:  'background:#fef9c3;color:#854d0e;',
    critical: 'background:#fee2e2;color:#991b1b;'
  };
  const labels: Record<RiskLevel, string> = {
    healthy: '✅ Healthy', warning: '⚠️ Warning', critical: '🚨 Critical'
  };
  return `<span style="padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;${styles[level]}">${labels[level]}</span>`;
};

const baseTemplate = (title: string, accentColor: string, body: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:${accentColor};padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;color:rgba(255,255,255,0.8);font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">ASA Timesheet Portal</p>
                  <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:800;">${title}</h1>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:32px;">${body}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
              This is an automated message from ASA Timesheet Portal. Please do not reply.<br>
              <a href="${FRONTEND_URL}" style="color:#6366f1;text-decoration:none;">timesheet.asaind.co.in</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const hoursBar = (logged: number, target: number, color: string) => {
  const pct = Math.min(Math.round((logged / target) * 100), 100);
  return `
  <div style="margin:16px 0;">
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
      <span style="font-size:12px;font-weight:700;color:#475569;">Logged Hours</span>
      <span style="font-size:12px;font-weight:800;color:${color};">${logged} / ${target} hrs</span>
    </div>
    <div style="background:#e2e8f0;border-radius:999px;height:8px;overflow:hidden;">
      <div style="background:${color};width:${pct}%;height:100%;border-radius:999px;"></div>
    </div>
  </div>`;
};

// ── Template 1: Daily Missing Yesterday ──────────────────────

export const sendMissingYesterdayEmail = async (
  employee: { officeEmail: string; firstName: string; lastName: string },
  data: EmailTemplateData,
  cc: string[] = []
): Promise<boolean> => {
  const name = `${employee.firstName} ${employee.lastName || ''}`.trim();
  const body = `
    <p style="color:#475569;font-size:15px;line-height:1.6;">Hello <strong>${name}</strong>,</p>
    <p style="color:#475569;font-size:15px;line-height:1.6;">
      This is a reminder that your timesheet entry for <strong>yesterday</strong> has not been filled.
      Please update your timesheet to keep your records accurate.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <span style="font-size:13px;font-weight:700;color:#1e293b;">Compliance Status</span>
        ${riskBadge(data.riskLevel)}
      </div>
      ${hoursBar(data.weeklyHours, data.targetHours, data.weeklyHours < 20 ? '#ef4444' : '#f59e0b')}
      ${data.missingDays.length > 0 ? `<p style="margin:8px 0 0;font-size:13px;color:#ef4444;font-weight:600;">⚠️ Missing Days: ${data.missingDays.join(', ')}</p>` : ''}
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${FRONTEND_URL}/timesheet"
         style="background:#4f46e5;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;display:inline-block;">
        📝 Fill Timesheet Now
      </a>
    </div>
    <p style="color:#94a3b8;font-size:12px;">Timesheets must be submitted by end of each business day.</p>`;

  return sendEmail({
    to: employee.officeEmail,
    cc: cc.length > 0 ? cc : undefined,
    subject: `⏰ Timesheet Reminder — Missing Entry for Yesterday`,
    html: baseTemplate('Timesheet Reminder', '#4f46e5', body)
  });
};

// ── Template 2: Thursday Warning ─────────────────────────────

export const sendThursdayWarningEmail = async (
  employee: { officeEmail: string; firstName: string; lastName: string },
  data: EmailTemplateData,
  cc: string[] = []
): Promise<boolean> => {
  const name = `${employee.firstName} ${employee.lastName || ''}`.trim();
  const remaining = Math.max(0, data.targetHours - data.weeklyHours);
  const body = `
    <p style="color:#475569;font-size:15px;line-height:1.6;">Hello <strong>${name}</strong>,</p>
    <p style="color:#475569;font-size:15px;line-height:1.6;">
      It's <strong>Thursday</strong> and your logged hours are below the expected threshold.
      You still need <strong style="color:#d97706;">${remaining.toFixed(1)} more hours</strong> to reach the weekly target of 40 hours.
    </p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:20px;margin:20px 0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <span style="font-size:13px;font-weight:700;color:#1e293b;">Weekly Progress</span>
        ${riskBadge(data.riskLevel)}
      </div>
      ${hoursBar(data.weeklyHours, data.targetHours, '#f59e0b')}
      ${data.missingDays.length > 0 ? `<p style="margin:8px 0 0;font-size:13px;color:#d97706;font-weight:600;">📅 Missing: ${data.missingDays.join(', ')}</p>` : ''}
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${FRONTEND_URL}/timesheet"
         style="background:#d97706;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;display:inline-block;">
        ⚡ Update Timesheet
      </a>
    </div>`;

  return sendEmail({
    to: employee.officeEmail,
    cc: cc.length > 0 ? cc : undefined,
    subject: `⚠️ Thursday Timesheet Warning — ${data.weeklyHours}/${data.targetHours} hrs logged`,
    html: baseTemplate('Thursday Warning', '#d97706', body)
  });
};

// ── Template 3: Friday Critical ───────────────────────────────

export const sendFridayCriticalEmail = async (
  employee: { officeEmail: string; firstName: string; lastName: string },
  data: EmailTemplateData,
  cc: string[] = []
): Promise<boolean> => {
  const name = `${employee.firstName} ${employee.lastName || ''}`.trim();
  const body = `
    <p style="color:#475569;font-size:15px;line-height:1.6;">Hello <strong>${name}</strong>,</p>
    <p style="color:#475569;font-size:15px;line-height:1.6;">
      <strong>🚨 Urgent:</strong> Today is <strong>Friday</strong> and your weekly timesheet is still incomplete.
      Timesheets must be submitted before end of day for payroll processing.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:20px 0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <span style="font-size:13px;font-weight:700;color:#1e293b;">Current Status</span>
        ${riskBadge(data.riskLevel)}
      </div>
      ${hoursBar(data.weeklyHours, data.targetHours, '#ef4444')}
      ${data.missingDays.length > 0 ? `<p style="margin:8px 0 0;font-size:13px;color:#ef4444;font-weight:600;">🚫 Missing Days: ${data.missingDays.join(', ')}</p>` : ''}
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${FRONTEND_URL}/timesheet"
         style="background:#dc2626;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;display:inline-block;">
        🚨 Complete & Submit Now
      </a>
    </div>
    <p style="color:#dc2626;font-size:12px;font-weight:600;">This is your final reminder. Non-submission will be escalated on Monday.</p>`;

  return sendEmail({
    to: employee.officeEmail,
    cc: cc.length > 0 ? cc : undefined,
    subject: `🚨 CRITICAL: Friday Timesheet Deadline — ${data.weeklyHours}/${data.targetHours} hrs`,
    html: baseTemplate('Critical Reminder', '#dc2626', body)
  });
};

// ── Template 4: Monday Escalation ─────────────────────────────

export const sendMondayEscalationEmail = async (
  toEmail: string,
  employee: { firstName: string; lastName: string },
  data: EmailTemplateData,
  cc: string[] = []
): Promise<boolean> => {
  const name = `${employee.firstName} ${employee.lastName || ''}`.trim();
  const body = `
    <p style="color:#475569;font-size:15px;line-height:1.6;">
      This is an <strong>automated escalation alert</strong> regarding timesheet non-compliance.
    </p>
    <div style="background:#fff1f2;border:2px solid #fecdd3;border-radius:12px;padding:20px;margin:20px 0;">
      <p style="margin:0 0 12px;font-size:16px;font-weight:800;color:#991b1b;">Employee: ${name}</p>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <span style="font-size:13px;font-weight:700;color:#1e293b;">Previous Week Status</span>
        ${riskBadge(data.riskLevel)}
      </div>
      ${hoursBar(data.weeklyHours, data.targetHours, '#dc2626')}
      ${data.missingDays.length > 0 ? `<p style="margin:8px 0 0;font-size:13px;color:#dc2626;font-weight:600;">Missing Days: ${data.missingDays.join(', ')}</p>` : ''}
      <p style="margin:12px 0 0;font-size:12px;color:#64748b;">Week of: ${data.weekStart}</p>
    </div>
    <p style="color:#475569;font-size:14px;">
      Please follow up with <strong>${name}</strong> to ensure this is resolved and that billing cycles are not affected.
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${FRONTEND_URL}/compliance"
         style="background:#7c3aed;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;display:inline-block;">
        📊 View Compliance Dashboard
      </a>
    </div>`;

  return sendEmail({
    to: toEmail,
    cc: cc.length > 0 ? cc : undefined,
    subject: `🚨 Escalation: ${name} — Timesheet Non-Compliance (${data.weeklyHours}/${data.targetHours} hrs)`,
    html: baseTemplate('Compliance Escalation', '#7c3aed', body)
  });
};

// ── Template 5: Manager Summary ───────────────────────────────

export const sendManagerSummaryEmail = async (
  managerEmail: string,
  managerName: string,
  teamData: {
    totalEmployees: number;
    compliantCount: number;
    belowHours: Array<{ name: string; hours: number; missingDays: string[] }>;
    weekStart: string;
  }
): Promise<boolean> => {
  const compliancePct = Math.round(
    (teamData.compliantCount / (teamData.totalEmployees || 1)) * 100
  );

  const rowsHtml = teamData.belowHours
    .map(
      emp => `
      <tr>
        <td style="padding:10px 12px;font-size:13px;color:#1e293b;font-weight:600;">${emp.name}</td>
        <td style="padding:10px 12px;font-size:13px;color:#ef4444;font-weight:700;">${emp.hours} hrs</td>
        <td style="padding:10px 12px;font-size:13px;color:#64748b;">${emp.missingDays.join(', ') || '—'}</td>
      </tr>`
    )
    .join('');

  const body = `
    <p style="color:#475569;font-size:15px;line-height:1.6;">Hello <strong>${managerName}</strong>,</p>
    <p style="color:#475569;font-size:15px;">Here is your team's weekly compliance summary for <strong>w/o ${teamData.weekStart}</strong>:</p>
    <div style="display:flex;gap:16px;margin:20px 0;">
      <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;text-align:center;">
        <p style="margin:0;font-size:28px;font-weight:900;color:#16a34a;">${compliancePct}%</p>
        <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:1px;">Team Compliance</p>
      </div>
      <div style="flex:1;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;text-align:center;">
        <p style="margin:0;font-size:28px;font-weight:900;color:#dc2626;">${teamData.belowHours.length}</p>
        <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:1px;">Below 40 hrs</p>
      </div>
    </div>
    ${teamData.belowHours.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:16px 0;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Employee</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Hours</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Missing Days</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>` : '<p style="color:#16a34a;font-weight:700;">🎉 All team members are compliant this week!</p>'}
    <div style="text-align:center;margin:28px 0;">
      <a href="${FRONTEND_URL}/compliance"
         style="background:#4f46e5;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;display:inline-block;">
        📊 View Full Dashboard
      </a>
    </div>`;

  return sendEmail({
    to: managerEmail,
    subject: `📊 Weekly Team Compliance Summary — ${compliancePct}% compliant`,
    html: baseTemplate('Team Compliance Summary', '#4f46e5', body)
  });
};
