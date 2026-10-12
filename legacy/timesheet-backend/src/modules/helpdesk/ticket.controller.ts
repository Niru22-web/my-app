import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { sendITEmail } from "../../services/mail.service";
import { getIO } from "../../services/socket.service";
import { sendTicketCreatedMail, sendAssignmentMail, sendStatusUpdateMail } from "../../services/helpdeskMail.service";
import { formatCategory } from "./helpdesk.service";
import { triggerNotification } from "../../services/notification.service";

// GET /tickets/:id — Get a single ticket with full history
export const getTicketById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ticket = await (prisma.ticket as any).findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, employeeId: true, department: true }
        },
        categoryRel: true,
        subcategoryRel: true,
        attachments: true,
        history: {
          orderBy: { performedAt: 'desc' },
          include: { 
            performer: { select: { firstName: true, lastName: true } },
            attachments: true
          }
        }
      }
    });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    let assigneeName = null;
    if (ticket.assignedTo) {
      const assignee = await prisma.employee.findUnique({
        where: { id: ticket.assignedTo },
        select: { firstName: true, lastName: true }
      });
      if (assignee) {
        assigneeName = `${assignee.firstName} ${assignee.lastName}`;
      }
    }

    const ticketWithAssignee = {
      ...ticket,
      assigneeName
    };
    res.json({ success: true, data: ticketWithAssignee });
  } catch (error: any) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket', error: error.message });
  }
};

export const createTicket = async (req: any, res: Response) => {
  try {
    const { title, description, priority, category, categoryId, subcategoryId, assignedTo: manualAssignedTo } = req.body;
    const userId = req.user?.id;

    console.log("Incoming ticket request:", req.body);
    if (req.files && Array.isArray(req.files)) {
      console.log(`Uploaded ${req.files.length} ticket file attachments`);
    } else if (req.file) {
      console.log("Uploaded single ticket file attachment:", req.file);
    }

    if (!title || !userId || !description) {
      return res.status(400).json({ message: "Missing required fields: title, description, or user ID" });
    }

    const files = req.files as Express.Multer.File[] | undefined;
    const attachmentRecords = files?.map(file => ({
      url: `/uploads/tickets/${file.filename}`,
      filename: file.originalname,
      size: file.size,
      mimeType: file.mimetype
    })) || [];

    if (req.file && attachmentRecords.length === 0) {
      attachmentRecords.push({
        url: `/uploads/tickets/${req.file.filename}`,
        filename: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
      });
    }

    const firstAttachmentUrl = attachmentRecords.length > 0 ? attachmentRecords[0].url : null;
    
    // Generate sequential ticket ID starting from 1 (TKT-1, TKT-2, etc.)
    const existingTickets = await (prisma.ticket as any).findMany({
      where: {
        ticketId: {
          startsWith: 'TKT-'
        }
      },
      select: {
        ticketId: true
      }
    });

    let maxNum = 0;
    for (const t of existingTickets) {
      if (t.ticketId) {
        const num = parseInt(t.ticketId.replace('TKT-', ''), 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
    const generatedTicketId = `TKT-${maxNum + 1}`;

    // Fetch category configuration
    let categoryConfig: any = null;
    if (subcategoryId) {
      const parsedSubId = parseInt(subcategoryId, 10);
      if (!isNaN(parsedSubId)) {
        const rawCategoryConfig = await prisma.helpdeskCategory.findUnique({
          where: { id: parsedSubId },
          include: { parent: true }
        });
        if (rawCategoryConfig) {
          categoryConfig = formatCategory(rawCategoryConfig, rawCategoryConfig.parent);
        }
      }
    }
    if (!categoryConfig && categoryId) {
      const parsedCatId = parseInt(categoryId, 10);
      if (!isNaN(parsedCatId)) {
        const rawCategoryConfig = await prisma.helpdeskCategory.findUnique({
          where: { id: parsedCatId }
        });
        if (rawCategoryConfig) {
          categoryConfig = formatCategory(rawCategoryConfig);
        }
      }
    }

    // Auto-routing & Category Assignment logic
    let routingDept = "IT"; // default fallback
    let categoryNameText = category || "IT Support";

    if (categoryConfig) {
      categoryNameText = categoryConfig.category_name;
      if (categoryConfig.assigned_team) {
        routingDept = categoryConfig.assigned_team;
      } else {
        // Fallback to substring matching if assigned_team is empty
        if (categoryNameText.toLowerCase().includes("hr")) {
          routingDept = "HR";
        } else if (categoryNameText.toLowerCase().includes("finance") || categoryNameText.toLowerCase().includes("salary") || categoryNameText.toLowerCase().includes("reimbursement")) {
          routingDept = "Finance";
        } else if (categoryNameText.toLowerCase().includes("admin") || categoryNameText.toLowerCase().includes("seating") || categoryNameText.toLowerCase().includes("asset")) {
          routingDept = "Admin";
        }
      }
    } else if (categoryId) {
      // If we couldn't load config but have category name, run fallback checks
      if (categoryNameText.toLowerCase().includes("hr")) {
        routingDept = "HR";
      } else if (categoryNameText.toLowerCase().includes("finance") || categoryNameText.toLowerCase().includes("salary") || categoryNameText.toLowerCase().includes("reimbursement")) {
        routingDept = "Finance";
      } else if (categoryNameText.toLowerCase().includes("admin") || categoryNameText.toLowerCase().includes("seating") || categoryNameText.toLowerCase().includes("asset")) {
        routingDept = "Admin";
      }
    }

    // Find active employees belonging to the targeted support department/role
    let supportUsers = await prisma.employee.findMany({
      where: {
        OR: [
          { department: { equals: routingDept, mode: "insensitive" } },
          { role: { equals: routingDept, mode: "insensitive" } },
          { role: { contains: routingDept, mode: "insensitive" } }
        ],
        status: "active"
      }
    });

    // Fallback: If no users in the target department are found, find standard IT support staff
    if (supportUsers.length === 0) {
      supportUsers = await prisma.employee.findMany({
        where: {
          OR: [
            { role: { equals: "IT", mode: "insensitive" } },
            { role: { contains: "IT", mode: "insensitive" } }
          ],
          status: "active"
        }
      });
    }

    let finalAssignedTo: string | null = null;
    let assignmentRemarks = '';

    if (manualAssignedTo && typeof manualAssignedTo === 'string' && manualAssignedTo.trim()) {
      finalAssignedTo = manualAssignedTo.trim();
      assignmentRemarks = `Manually assigned to Support Agent`;
    } else if (categoryConfig && categoryConfig.auto_assign_user_id) {
      // Auto-assign to the designated category owner
      const assignedUser = await prisma.employee.findFirst({
        where: { id: categoryConfig.auto_assign_user_id, status: "active" }
      });
      if (assignedUser) {
        finalAssignedTo = assignedUser.id;
        assignmentRemarks = `Auto-assigned to Category Owner (${assignedUser.firstName} ${assignedUser.lastName})`;
      }
    }

    if (!finalAssignedTo && supportUsers.length > 0) {
      // Auto-assign to the support person with the least open tickets (load balancing)
      const ticketCounts = await Promise.all(
        supportUsers.map(async (u) => {
          const count = await (prisma.ticket as any).count({
            where: {
              assignedTo: u.id,
              status: { notIn: ['Resolved', 'Returned'] }
            }
          });
          return { id: u.id, count };
        })
      );
      ticketCounts.sort((a, b) => a.count - b.count);
      finalAssignedTo = ticketCounts[0].id;
      assignmentRemarks = `Auto-assigned to ${routingDept} Support Team`;
    }

    const ticket = await (prisma.ticket as any).create({
      data: {
        ticketId: generatedTicketId,
        title,
        description,
        priority: priority || "Medium",
        category: categoryNameText,
        categoryId: categoryId ? parseInt(categoryId, 10) : null,
        subcategoryId: subcategoryId ? parseInt(subcategoryId, 10) : null,
        createdById: userId,
        assignedTo: finalAssignedTo,
        attachmentUrl: firstAttachmentUrl,
        attachments: {
          create: attachmentRecords
        },
        history: {
          create: [
            {
              action: "Created",
              performedById: userId,
              remarks: "Ticket initially raised"
            },
            ...(finalAssignedTo ? [{
              action: "Assigned",
              performedById: userId,
              toAssignee: finalAssignedTo,
              remarks: assignmentRemarks
            }] : [])
          ]
        }
      },
      include: {
        createdBy: true,
        history: true,
        attachments: true
      }
    });

    // Send routed emails using the helpdesk mail service
    try {
      await sendTicketCreatedMail(ticket, categoryConfig);
    } catch (err) {
      console.error("Failed to trigger ticket created email workflow:", err);
    }

    if (finalAssignedTo) {
      const assigneeUser = supportUsers.find((u: any) => u.id === finalAssignedTo) || 
                           await prisma.employee.findUnique({ where: { id: finalAssignedTo } });
      if (assigneeUser) {
        try {
          await sendAssignmentMail(ticket, categoryConfig, assigneeUser, null);
        } catch (err) {
          console.error("Failed to send assignment mail to support agent:", err);
        }
      }
    }

    // 4. Create in-app notifications for all support users
    if (supportUsers.length > 0) {
      const notificationsData = supportUsers.map((user: any) => ({
        userId: user.id,
        title: "New Support Ticket",
        message: `New support ticket raised: ${ticket.title}`,
        type: "IT_TICKET",
        relatedId: ticket.id,
        actionUrl: "/help-desk"
      }));

      await prisma.notification.createMany({
        data: notificationsData
      });

      // 5. Emit real-time socket notification
      const io = getIO();
      if (io) {
        supportUsers.forEach((user: any) => {
          io.to(user.id).emit('new_notification', {
            title: "New Support Ticket",
            message: `New support ticket raised: ${ticket.title}`,
            type: "IT_TICKET",
            createdAt: new Date()
          });
        });
      }
    }

    res.json({
      success: true,
      message: "Ticket raised successfully",
      data: {
        ...ticket,
        assignedTeam: categoryConfig?.assigned_team || routingDept,
        slaHours: categoryConfig?.sla_hours ?? 24
      }
    });
  } catch (error: any) {
    console.error("Error raising ticket:", error);
    res.status(500).json({ success: false, message: "Failed to raise ticket", error: error.message });
  }
};

export const getAllTickets = async (req: any, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      console.error("❌ [getAllTickets] User context missing in request");
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userRole = user.role?.toLowerCase() || '';
    const isSupport = userRole === 'admin' || userRole === 'it' || userRole.includes('it') || userRole.includes('support');

    console.log(`🔍 [getAllTickets] Fetching tickets for user: ${user.id} (Role: ${user.role})`);

    const where: any = {};
    if (!isSupport) {
      if (userRole === 'manager') {
        const teamEmployees = await prisma.employee.findMany({
          where: {
            OR: [
              { managerId: user.id },
              { subManagerId: user.id },
              { reportingManagerIds: { has: user.id } },
              { subManagerIds: { has: user.id } }
            ]
          },
          select: { id: true }
        });
        const allowedUserIds = [user.id, ...teamEmployees.map(e => e.id)];
        where.createdById = { in: allowedUserIds };
      } else if (userRole === 'partner') {
        const teamEmployees = await prisma.employee.findMany({
          where: {
            OR: [
              { partnerId: user.id },
              { reportingPartnerIds: { has: user.id } }
            ]
          },
          select: { id: true }
        });
        const allowedUserIds = [user.id, ...teamEmployees.map(e => e.id)];
        where.createdById = { in: allowedUserIds };
      } else {
        // Regular employees and Accounts role only see their own tickets
        where.createdById = user.id;
      }
    }

    const tickets = await (prisma.ticket as any).findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            department: true
          }
        },
        categoryRel: true,
        subcategoryRel: true,
        attachments: true,
        history: {
          orderBy: { performedAt: 'desc' },
          include: { 
            performer: {
              select: { firstName: true, lastName: true }
            },
            attachments: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Resolve employee assignee names
    const employees = await prisma.employee.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true
      }
    });
    const employeesMap = new Map(employees.map(e => [e.id, `${e.firstName} ${e.lastName}`]));

    const ticketsWithAssignee = tickets.map((t: any) => ({
      ...t,
      assigneeName: t.assignedTo ? (employeesMap.get(t.assignedTo) || 'Support Agent') : null
    }));

    console.log(`✅ [getAllTickets] Successfully retrieved ${tickets.length} tickets`);
    return res.json({ success: true, data: ticketsWithAssignee || [] });
  } catch (error: any) {
    console.error("🔥 [getAllTickets] Critical Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error while fetching tickets", 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

export const updateTicketStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, assignedTo } = req.body;

    const user = (req as any).user;
    const performerId = user?.id;
    const userRole = user?.role?.toLowerCase() || '';

    const oldTicket = await (prisma.ticket as any).findUnique({ where: { id } });
    if (!oldTicket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    const isITOrAdmin = userRole === 'admin' || userRole === 'it' || userRole.includes('it') || userRole.includes('support');
    const isCreator = oldTicket.createdById === performerId;

    if (!isITOrAdmin) {
      if (!isCreator) {
        return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to modify this ticket" });
      }
      if (status !== 'Returned') {
        return res.status(403).json({ success: false, message: "Forbidden: Regular employees can only return tickets" });
      }
    }

    let targetAssignee = assignedTo;
    if (status === 'In Progress' && !targetAssignee) {
      targetAssignee = performerId;
    } else if (status === 'Open') {
      targetAssignee = null;
    }

    const historyData: any = {
      action: status === 'Returned' ? 'Returned' : 'StatusUpdate',
      fromStatus: oldTicket.status,
      toStatus: status || oldTicket.status,
      fromAssignee: oldTicket.assignedTo,
      toAssignee: targetAssignee !== undefined ? targetAssignee : oldTicket.assignedTo,
      performedById: performerId,
      remarks: status === 'Returned' ? 'Ticket returned by user' : null
    };

    if (targetAssignee && targetAssignee !== oldTicket.assignedTo) {
      historyData.action = "Assigned";
    }

    const ticket = await (prisma.ticket as any).update({
      where: { id },
      data: { 
        status,
        assignedTo: targetAssignee !== undefined ? targetAssignee : undefined,
        history: {
          create: historyData
        }
      },
      include: {
        attachments: true,
        history: {
          orderBy: { performedAt: 'desc' },
          include: { 
            performer: true,
            attachments: true
          }
        }
      }
    });

    // Send email notifications
    sendTicketUpdateNotifications(ticket.id, historyData);

    let assigneeName = null;
    if (ticket.assignedTo) {
      const assignee = await prisma.employee.findUnique({
        where: { id: ticket.assignedTo },
        select: { firstName: true, lastName: true }
      });
      if (assignee) {
        assigneeName = `${assignee.firstName} ${assignee.lastName}`;
      }
    }

    res.json({ 
      success: true, 
      message: "Ticket updated successfully", 
      data: { ...ticket, assigneeName } 
    });
  } catch (error: any) {
    console.error("Error updating ticket:", error);
    res.status(500).json({ success: false, message: "Failed to update ticket", error: error.message });
  }
};

// POST /tickets/:id/history — Add a history entry + optionally update ticket status
export const addTicketHistory = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { action, toStatus, remarks, assignedTo } = req.body;
    const performerId = req.user?.id;
    const userRole = req.user?.role?.toLowerCase() || '';

    const existingTicket = await (prisma.ticket as any).findUnique({ where: { id } });
    if (!existingTicket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    const isITOrAdmin = userRole === 'admin' || userRole === 'it' || userRole.includes('it') || userRole.includes('support');
    if (toStatus && toStatus !== existingTicket.status) {
      if (!isITOrAdmin) {
        const isCreator = existingTicket.createdById === performerId;
        if (!isCreator || toStatus !== 'Returned') {
          return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to transition status to this value" });
        }
      }
    }

    const files = req.files as Express.Multer.File[] | undefined;
    const attachmentRecords = files?.map(file => ({
      url: `/uploads/tickets/${file.filename}`,
      filename: file.originalname,
      size: file.size,
      mimeType: file.mimetype
    })) || [];

    if (req.file && attachmentRecords.length === 0) {
      attachmentRecords.push({
        url: `/uploads/tickets/${req.file.filename}`,
        filename: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
      });
    }

    const updateData: any = {
      history: {
        create: {
          action: toStatus === 'Returned' ? 'Returned' : (action || "Comment"),
          fromStatus: existingTicket.status,
          toStatus: toStatus || existingTicket.status,
          fromAssignee: existingTicket.assignedTo,
          toAssignee: assignedTo || existingTicket.assignedTo,
          performedById: performerId,
          remarks: remarks || null,
          attachments: {
            create: attachmentRecords
          }
        }
      }
    };

    // Update ticket status if a new status is provided
    if (toStatus && toStatus !== existingTicket.status) {
      updateData.status = toStatus;
    }
    if (assignedTo && assignedTo !== existingTicket.assignedTo) {
      updateData.assignedTo = assignedTo;
    }

    const ticket = await (prisma.ticket as any).update({
      where: { id },
      data: updateData,
      include: {
        attachments: true,
        history: {
          orderBy: { performedAt: 'desc' },
          include: { 
            performer: { select: { firstName: true, lastName: true } },
            attachments: true
          }
        }
      }
    });

    // Send email notifications
    sendTicketUpdateNotifications(ticket.id, {
      action: toStatus === 'Returned' ? 'Returned' : (action || "Comment"),
      toStatus: toStatus || existingTicket.status,
      performedById: performerId,
      remarks: remarks || null
    });

    res.json({ success: true, message: "Ticket history added successfully", data: ticket });
  } catch (error: any) {
    console.error("Error adding ticket history:", error);
    res.status(500).json({ success: false, message: "Failed to add ticket history", error: error.message });
  }
};

// DELETE /tickets/:id — Delete a ticket (Admin, IT & Ticket Creator)
export const deleteTicket = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role?.toLowerCase() || '';
    const performerId = req.user?.id;
    const performerEmployeeId = req.user?.employeeId;

    console.log(`🗑️ [deleteTicket] User id: "${performerId}", employeeId: "${performerEmployeeId}", role: "${userRole}" trying to delete ticket: ${id}`);

    const existingTicket = await (prisma.ticket as any).findUnique({ 
      where: { id },
      include: { createdBy: { select: { id: true, employeeId: true } } }
    });
    if (!existingTicket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    console.log(`🗑️ [deleteTicket] Ticket createdById: "${existingTicket.createdById}", createdBy.id: "${existingTicket.createdBy?.id}", createdBy.employeeId: "${existingTicket.createdBy?.employeeId}"`);

    const isITOrAdmin = userRole === 'admin' || userRole === 'it' || userRole.includes('it') || userRole.includes('support');
    // Match by UUID id OR by employeeId string (handles both JWT payload formats)
    const isCreator = existingTicket.createdById === performerId ||
                      existingTicket.createdBy?.employeeId === performerEmployeeId;

    console.log(`🗑️ [deleteTicket] isITOrAdmin: ${isITOrAdmin}, isCreator: ${isCreator}`);

    if (!isITOrAdmin && !isCreator) {
      return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to delete this ticket" });
    }

    await (prisma.ticket as any).delete({ where: { id } });

    console.log(`✅ [deleteTicket] Ticket ${id} deleted successfully`);
    res.json({ success: true, message: "Ticket deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting ticket:", error);
    res.status(500).json({ success: false, message: "Failed to delete ticket", error: error.message });
  }
};

const sendTicketUpdateNotifications = async (ticketId: string, historyEntry: any) => {
  try {
    const ticket = await (prisma.ticket as any).findUnique({
      where: { id: ticketId },
      include: {
        createdBy: true
      }
    });

    if (!ticket) return;

    // Fetch category config
    let categoryConfig: any = null;
    if (ticket.subcategoryId) {
      const rawCategoryConfig = await prisma.helpdeskCategory.findUnique({
        where: { id: ticket.subcategoryId },
        include: { parent: true }
      });
      if (rawCategoryConfig) {
        categoryConfig = formatCategory(rawCategoryConfig, rawCategoryConfig.parent);
      }
    }
    if (!categoryConfig && ticket.categoryId) {
      const rawCategoryConfig = await prisma.helpdeskCategory.findUnique({
        where: { id: ticket.categoryId }
      });
      if (rawCategoryConfig) {
        categoryConfig = formatCategory(rawCategoryConfig);
      }
    }

    // Fetch performer
    const performer = await prisma.employee.findUnique({
      where: { id: historyEntry.performedById }
    });

    // Check if assignee changed
    if (historyEntry.toAssignee && historyEntry.toAssignee !== historyEntry.fromAssignee) {
      const assignee = await prisma.employee.findUnique({
        where: { id: historyEntry.toAssignee }
      });
      if (assignee) {
        try {
          await sendAssignmentMail(ticket, categoryConfig, assignee, performer);
        } catch (err) {
          console.error("Failed to send assignment mail:", err);
        }
        // Trigger In-App Notification
        try {
          await triggerNotification({
            userId: assignee.id,
            title: 'Support Ticket Assigned 🎫',
            message: `You have been assigned ticket ${ticket.ticketId || 'TKT'}: "${ticket.title}" by ${performer?.firstName || 'System'}`,
            type: 'ticket_assigned',
            module: 'HelpDesk',
            priority: 'High',
            actionUrl: '/help-desk',
            relatedId: ticket.id
          });
        } catch (err) {
          console.error("Failed to trigger in-app assignment notification:", err);
        }
      }
    }

    // Send status update notification to creator
    if (historyEntry.toStatus && historyEntry.toStatus !== historyEntry.fromStatus) {
      if (ticket.createdById !== historyEntry.performedById) {
        try {
          const isResolved = historyEntry.toStatus === 'Resolved';
          await triggerNotification({
            userId: ticket.createdById,
            title: isResolved ? 'Support Ticket Resolved ✅' : 'Support Ticket Status Updated 🎫',
            message: `Your ticket ${ticket.ticketId || 'TKT'}: "${ticket.title}" status has been updated to "${historyEntry.toStatus}" by ${performer?.firstName || 'System'}`,
            type: isResolved ? 'ticket_resolved' : 'ticket_status_updated',
            module: 'HelpDesk',
            priority: isResolved ? 'High' : 'Info',
            actionUrl: '/help-desk',
            relatedId: ticket.id
          });
        } catch (err) {
          console.error("Failed to trigger in-app status update notification:", err);
        }
      }
    }

    // Send comment notification
    if (historyEntry.action === 'Comment') {
      // Notify creator if they didn't write it
      if (ticket.createdById !== historyEntry.performedById) {
        try {
          await triggerNotification({
            userId: ticket.createdById,
            title: 'New Ticket Comment 💬',
            message: `New comment on your ticket "${ticket.title}" by ${performer?.firstName || 'User'}`,
            type: 'ticket_comment',
            module: 'HelpDesk',
            priority: 'Info',
            actionUrl: '/help-desk',
            relatedId: ticket.id
          });
        } catch (err) {
          console.error("Failed to trigger in-app comment notification to creator:", err);
        }
      }
      // Notify assignee if they didn't write it
      if (ticket.assignedTo && ticket.assignedTo !== historyEntry.performedById) {
        try {
          await triggerNotification({
            userId: ticket.assignedTo,
            title: 'New Ticket Comment 💬',
            message: `New comment on assigned ticket "${ticket.title}" by ${performer?.firstName || 'User'}`,
            type: 'ticket_comment',
            module: 'HelpDesk',
            priority: 'Info',
            actionUrl: '/help-desk',
            relatedId: ticket.id
          });
        } catch (err) {
          console.error("Failed to trigger in-app comment notification to assignee:", err);
        }
      }
    }

    // Send status update/comment mail
    try {
      await sendStatusUpdateMail(ticket, categoryConfig, historyEntry, performer);
    } catch (err) {
      console.error("Failed to send status update/comment mail:", err);
    }
  } catch (err) {
    console.error("Error sending ticket update notification emails:", err);
  }
};
