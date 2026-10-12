import { sendEmail } from "./email.service";

// Helper to format date in IST (Indian Standard Time)
const formatDateIST = (dateStr: Date | string) => {
  const date = new Date(dateStr);
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

// Helper to compute and format SLA deadline
const formatSlaDeadline = (createdAt: Date | string, slaHours: number) => {
  const date = new Date(createdAt);
  date.setHours(date.getHours() + slaHours);
  return formatDateIST(date);
};

/**
 * Send email notifications when a new ticket is raised.
 * Routes to configured support email + CC, and sends a confirmation to the creator.
 */
export const sendTicketCreatedMail = async (ticket: any, categoryConfig: any) => {
  const frontendUrl = process.env.FRONTEND_URL || "https://timesheet.asaind.co.in";
  const displayedTicketId = ticket.ticketId || ticket.id;
  const slaHours = categoryConfig?.sla_hours ?? 24;
  const deadlineStr = formatSlaDeadline(ticket.createdAt, slaHours);
  const raisedDateStr = formatDateIST(ticket.createdAt);

  const creatorName = `${ticket.createdBy?.firstName} ${ticket.createdBy?.lastName}`;
  const creatorDept = ticket.createdBy?.department || "General";
  const categoryName = categoryConfig?.category_name || ticket.category || "IT Support";
  
  // Format attachments for HTML
  let attachmentLinks = "";
  if (ticket.attachments && ticket.attachments.length > 0) {
    attachmentLinks = ticket.attachments.map((att: any) => 
      `<li style="margin-bottom: 6px;"><a href="${frontendUrl}${att.url}" target="_blank" style="color: #4f46e5; font-weight: 600; text-decoration: none;">${att.filename}</a></li>`
    ).join("");
  }
  const attachmentsHtml = attachmentLinks 
    ? `<div style="margin-top: 16px; padding: 12px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <span style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase;">Attachments</span>
        <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13px;">${attachmentLinks}</ul>
       </div>`
    : "";

  const viewUrl = `${frontendUrl}/help-desk`;

  // 1. Send HTML to Support Team
  const supportEmail = categoryConfig?.support_email || "tech@asaind.co.in";
  const ccEmail = categoryConfig?.cc_email || undefined;
  
  const supportHtml = `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
      <div style="background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); padding: 28px 24px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">New Help Desk Ticket</h2>
        <p style="color: #e0e7ff; margin: 6px 0 0 0; font-size: 13px; font-weight: 500;">Ticket ID: ${displayedTicketId} has been registered and routed.</p>
      </div>
      <div style="padding: 24px;">
        <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0;">${ticket.title}</h3>
        <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0; background-color: #f8fafc; padding: 16px; border-radius: 12px; border-left: 4px solid #cbd5e1;">${ticket.description}</p>
        
        <table style="width: 100%; margin-top: 24px; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 40%;">Raised By</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${creatorName} (${creatorDept})</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Category</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${categoryName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Priority</td>
            <td style="padding: 6px 0;"><span style="background-color: ${ticket.priority === 'High' ? '#fef2f2' : ticket.priority === 'Medium' ? '#fffbeb' : '#eff6ff'}; color: ${ticket.priority === 'High' ? '#ef4444' : ticket.priority === 'Medium' ? '#f59e0b' : '#3b82f6'}; padding: 3px 8px; border-radius: 9999px; font-weight: 700; font-size: 11px;">${ticket.priority}</span></td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Raised Date</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${raisedDateStr}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">SLA Deadline</td>
            <td style="padding: 6px 0; color: #ef4444; font-weight: 700;">${deadlineStr} (${slaHours} Hours)</td>
          </tr>
        </table>
        
        ${attachmentsHtml}

        <div style="text-align: center; margin-top: 32px; margin-bottom: 8px;">
          <a href="${viewUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px rgba(79, 70, 229, 0.15);">View Ticket</a>
        </div>
      </div>
      <div style="background-color: #f8fafc; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
        This is an automated operational notification from ASA Timesheet Helpdesk.
      </div>
    </div>
  `;

  await sendEmail({
    to: supportEmail,
    subject: `[HELPDESK] New ${categoryName} Ticket - ${ticket.title}`,
    html: supportHtml
  }).catch(err => console.error("Error sending support ticket created email:", err));

  if (ccEmail) {
    await sendEmail({
      to: ccEmail,
      subject: `[HELPDESK] CC: New ${categoryName} Ticket - ${ticket.title}`,
      html: supportHtml
    }).catch(err => console.error("Error sending CC support ticket created email:", err));
  }

  // 2. Send confirmation HTML to Creator
  if (ticket.createdBy?.officeEmail) {
    const creatorHtml = `
      <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
        <div style="background: linear-gradient(135deg, #10b981 0%, #047857 100%); padding: 28px 24px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">Ticket Raised Successfully</h2>
          <p style="color: #d1fae5; margin: 6px 0 0 0; font-size: 13px; font-weight: 500;">Ticket ID: ${displayedTicketId}</p>
        </div>
        <div style="padding: 24px;">
          <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">Hello ${ticket.createdBy.firstName},</p>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">Your ticket has been successfully created and routed to the <b>${categoryConfig?.assigned_team || 'IT'} Support Team</b>. We will review it within the SLA period of <b>${slaHours} hours</b>.</p>
          
          <div style="padding: 16px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #0f172a;">${ticket.title}</h4>
            <p style="margin: 0; font-size: 13px; color: #475569;">${ticket.description}</p>
          </div>
          
          <table style="width: 100%; margin-top: 20px; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 40%;">Category</td>
              <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${categoryName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Priority</td>
              <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${ticket.priority}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Expected Response by</td>
              <td style="padding: 6px 0; color: #10b981; font-weight: 700;">${deadlineStr}</td>
            </tr>
          </table>

          <div style="text-align: center; margin-top: 28px; margin-bottom: 8px;">
            <a href="${viewUrl}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">Track Status</a>
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
          This is an automated operational notification from ASA Timesheet Helpdesk.
        </div>
      </div>
    `;

    await sendEmail({
      to: ticket.createdBy.officeEmail,
      subject: `[HELPDESK] Ticket Raised: ${ticket.title} (${displayedTicketId})`,
      html: creatorHtml
    }).catch(err => console.error("Error sending creator ticket raised confirmation email:", err));
  }
};

/**
 * Send assignment email to the assigned Support Agent.
 */
export const sendAssignmentMail = async (ticket: any, categoryConfig: any, assignee: any, performer: any) => {
  if (!assignee?.officeEmail) return;

  const frontendUrl = process.env.FRONTEND_URL || "https://timesheet.asaind.co.in";
  const displayedTicketId = ticket.ticketId || ticket.id;
  const performerName = performer ? `${performer.firstName} ${performer.lastName}` : "System";
  const categoryName = categoryConfig?.category_name || ticket.category || "Support";
  const viewUrl = `${frontendUrl}/help-desk`;

  const html = `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
      <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 28px 24px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">Ticket Assigned to You</h2>
        <p style="color: #e0e7ff; margin: 6px 0 0 0; font-size: 13px; font-weight: 500;">Ticket ID: ${displayedTicketId}</p>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">Hello ${assignee.firstName},</p>
        <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">A support ticket has been assigned to you by <b>${performerName}</b>. Please review and start resolution.</p>
        
        <div style="padding: 16px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
          <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #0f172a;">${ticket.title}</h4>
          <p style="margin: 0; font-size: 13px; color: #475569;">${ticket.description}</p>
        </div>
        
        <table style="width: 100%; margin-top: 20px; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 40%;">Category</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${categoryName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Priority</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${ticket.priority}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Raised By</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${ticket.createdBy?.firstName} ${ticket.createdBy?.lastName}</td>
          </tr>
        </table>

        <div style="text-align: center; margin-top: 28px; margin-bottom: 8px;">
          <a href="${viewUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">View Ticket Queue</a>
        </div>
      </div>
      <div style="background-color: #f8fafc; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
        This is an automated operational notification from ASA Timesheet Helpdesk.
      </div>
    </div>
  `;

  await sendEmail({
    to: assignee.officeEmail,
    subject: `[HELPDESK] Ticket Assigned: ${ticket.title} (${displayedTicketId})`,
    html
  }).catch(err => console.error("Error sending ticket assignment email:", err));
};

/**
 * Send email notifications for ticket status change or new comments.
 */
export const sendStatusUpdateMail = async (ticket: any, categoryConfig: any, eventDetails: any, performer: any) => {
  const frontendUrl = process.env.FRONTEND_URL || "https://timesheet.asaind.co.in";
  const displayedTicketId = ticket.ticketId || ticket.id;
  const performerName = performer ? `${performer.firstName} ${performer.lastName}` : "System";
  const categoryName = categoryConfig?.category_name || ticket.category || "Support";
  const viewUrl = `${frontendUrl}/help-desk`;

  const remarksHtml = eventDetails.remarks 
    ? `<div style="margin: 16px 0; padding: 12px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #818cf8; font-size: 13px; color: #334155;">
        <b>Remarks/Comment:</b> ${eventDetails.remarks}
       </div>`
    : "";

  let actionDescription = "";
  if (eventDetails.action === "Comment") {
    actionDescription = `A new comment was added to the ticket by <b>${performerName}</b>.`;
  } else if (eventDetails.action === "StatusUpdate" || eventDetails.toStatus) {
    actionDescription = `The ticket status has been updated to <b>${ticket.status}</b> by <b>${performerName}</b>.`;
  } else {
    actionDescription = `The ticket has been updated by <b>${performerName}</b>.`;
  }

  const html = `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
      <div style="background: linear-gradient(135deg, #475569 0%, #1e293b 100%); padding: 24px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 800; letter-spacing: -0.5px;">Ticket Activity Update</h2>
        <p style="color: #cbd5e1; margin: 4px 0 0 0; font-size: 12px; font-weight: 500;">Ticket ID: ${displayedTicketId} | Status: ${ticket.status}</p>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">${actionDescription}</p>
        
        <div style="padding: 14px; background-color: #f1f5f9; border-radius: 8px; font-size: 13px; color: #475569;">
          <b style="color: #0f172a;">Subject:</b> ${ticket.title}
        </div>
        
        ${remarksHtml}

        <div style="text-align: center; margin-top: 28px; margin-bottom: 8px;">
          <a href="${viewUrl}" style="background-color: #475569; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block;">View Ticket Details</a>
        </div>
      </div>
      <div style="background-color: #f8fafc; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
        This is an automated operational notification from ASA Timesheet Helpdesk.
      </div>
    </div>
  `;

  // 1. Send to Ticket Creator (if performer is not the creator)
  if (ticket.createdBy?.officeEmail && ticket.createdById !== performer?.id) {
    await sendEmail({
      to: ticket.createdBy.officeEmail,
      subject: `[HELPDESK] Ticket Update: ${ticket.title} (${displayedTicketId})`,
      html
    }).catch(err => console.error("Error sending update email to creator:", err));
  }

  // 2. Send to Assignee (if ticket is assigned and performer is not the assignee)
  if (ticket.assignedTo && ticket.assignedTo !== performer?.id) {
    const assignee = await (global as any).prisma.employee.findUnique({
      where: { id: ticket.assignedTo },
      select: { officeEmail: true }
    }).catch(() => null);

    if (assignee?.officeEmail) {
      await sendEmail({
        to: assignee.officeEmail,
        subject: `[HELPDESK] Assigned Ticket Update: ${ticket.title} (${displayedTicketId})`,
        html
      }).catch(err => console.error("Error sending update email to assignee:", err));
    }
  }

  // 3. Send to Support Group if ticket is unassigned
  if (!ticket.assignedTo) {
    const supportEmail = categoryConfig?.support_email || "tech@asaind.co.in";
    await sendEmail({
      to: supportEmail,
      subject: `[HELPDESK] Unassigned Ticket Update: ${ticket.title} (${displayedTicketId})`,
      html
    }).catch(err => console.error("Error sending update email to support group:", err));
  }
};

/**
 * Send email notification for SLA breach escalations.
 */
export const sendEscalationMail = async (ticket: any, categoryConfig: any) => {
  const escalationEmail = categoryConfig?.escalation_email;
  if (!escalationEmail) return;

  const frontendUrl = process.env.FRONTEND_URL || "https://timesheet.asaind.co.in";
  const displayedTicketId = ticket.ticketId || ticket.id;
  const slaHours = categoryConfig?.sla_hours ?? 24;
  const raisedDateStr = formatDateIST(ticket.createdAt);
  const viewUrl = `${frontendUrl}/help-desk`;

  const html = `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
      <div style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); padding: 28px 24px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">SLA BREACH ESCALATION</h2>
        <p style="color: #fee2e2; margin: 6px 0 0 0; font-size: 13px; font-weight: 500;">Ticket ID: ${displayedTicketId} has exceeded its SLA deadline</p>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 14px; line-height: 1.6; color: #ef4444; font-weight: 700; margin: 0 0 16px 0;">⚠️ Attention Manager: The following ticket was not resolved within the SLA window of ${slaHours} hours.</p>
        
        <div style="padding: 16px; background-color: #fff5f5; border-radius: 12px; border: 1px solid #fee2e2;">
          <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #991b1b;">${ticket.title}</h4>
          <p style="margin: 0; font-size: 13px; color: #7f1d1d;">${ticket.description}</p>
        </div>
        
        <table style="width: 100%; margin-top: 20px; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 40%;">Category</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${categoryConfig?.category_name || ticket.category}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Priority</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${ticket.priority}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Raised By</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${ticket.createdBy?.firstName} ${ticket.createdBy?.lastName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Assigned To</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${ticket.assigneeName || 'Unassigned'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Creation Date</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${raisedDateStr}</td>
          </tr>
        </table>

        <div style="text-align: center; margin-top: 28px; margin-bottom: 8px;">
          <a href="${viewUrl}" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">Take Corrective Action</a>
        </div>
      </div>
      <div style="background-color: #f8fafc; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
        This is an automated escalation alert from ASA Timesheet Helpdesk.
      </div>
    </div>
  `;

  await sendEmail({
    to: escalationEmail,
    subject: `[HELPDESK ESCALATION] SLA Breached for Ticket: ${ticket.title} (${displayedTicketId})`,
    html
  }).catch(err => console.error("Error sending escalation email:", err));
};
