import ExcelJS from "exceljs";
import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../config/db";
import { authenticate, requireRoles } from "../plugins/auth";
import { createNotification } from "../utils/notify";

const ASSET_ADMIN_ROLES = ["admin", "owner", "it", "hr", "accounts"];

const isoDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

async function sendWorkbook(reply: FastifyReply, wb: ExcelJS.Workbook, filename: string) {
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return reply
    .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .header("Content-Disposition", `attachment; filename=${filename}`)
    .send(buf);
}

async function nextAssetCode(): Promise<string> {
  const rows = await prisma.assetInventory.findMany({ select: { assetId: true } });
  let max = 0;
  for (const r of rows) {
    const m = (r.assetId ?? "").match(/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `AST-${String(max + 1).padStart(4, "0")}`;
}

async function nextRequestCode(prefix = "REQ"): Promise<string> {
  const rows = await prisma.assetRequest.findMany({ select: { requestId: true } });
  let max = 0;
  for (const r of rows) {
    const m = r.requestId.match(/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

export async function assetRoutes(app: FastifyInstance) {
  // ── Inventory ──────────────────────────────────────────────────────────────
  app.get("/api/assets", { preHandler: [authenticate] }, async (_req, reply) => {
    const items = await prisma.assetInventory.findMany({
      where: { isDeleted: false },
      include: { vendorRelation: true },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ success: true, data: items });
  });

  app.post("/api/assets", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.assetName || !b.serialNumber || !b.category || !b.type) {
      return reply.code(400).send({
        success: false,
        message: "Asset name, serial number, category, and type are required.",
      });
    }

    const assetId = b.assetId ? String(b.assetId).trim() : await nextAssetCode();
    const created = await prisma.assetInventory.create({
      data: {
        assetId,
        assetName: String(b.assetName).trim(),
        serialNumber: String(b.serialNumber).trim(),
        category: String(b.category).trim(),
        type: String(b.type).trim(),
        officeTagNo: b.officeTagNo ? String(b.officeTagNo).trim() : null,
        condition: String(b.condition ?? "New"),
        status: String(b.status ?? "Available"),
        purchaseDate: b.purchaseDate ? new Date(b.purchaseDate) : null,
        purchaseCost: b.purchaseCost != null && b.purchaseCost !== "" ? Number(b.purchaseCost) : null,
        warrantyExpiry: b.warrantyExpiry ? new Date(b.warrantyExpiry) : null,
        vendorId: b.vendorId || null,
        location: b.location ? String(b.location).trim() : null,
        description: b.description ? String(b.description).trim() : null,
      },
      include: { vendorRelation: true },
    });
    return reply.code(201).send({ success: true, data: created });
  });

  app.put("/api/assets/:id", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, any>;
    const data: Record<string, any> = {};
    for (const k of ["assetName", "serialNumber", "category", "type", "officeTagNo", "condition", "status", "location", "description"] as const) {
      if (b[k] !== undefined) data[k] = b[k];
    }
    if (b.vendorId !== undefined) data.vendorId = b.vendorId || null;
    if (b.purchaseDate !== undefined) data.purchaseDate = b.purchaseDate ? new Date(b.purchaseDate) : null;
    if (b.warrantyExpiry !== undefined) data.warrantyExpiry = b.warrantyExpiry ? new Date(b.warrantyExpiry) : null;
    if (b.purchaseCost !== undefined) data.purchaseCost = b.purchaseCost != null && b.purchaseCost !== "" ? Number(b.purchaseCost) : null;

    const updated = await prisma.assetInventory.update({
      where: { id },
      data,
      include: { vendorRelation: true },
    });
    return reply.send({ success: true, data: updated });
  });

  // ── Allocations ────────────────────────────────────────────────────────────
  // Excel exports — same columns as the legacy portal's downloads
  app.get("/api/assets/export", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (_req, reply) => {
    const assets = await prisma.assetInventory.findMany({
      where: { isDeleted: false },
      include: { vendorRelation: true },
      orderBy: { createdAt: "desc" },
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Asset Inventory");
    ws.columns = [
      { header: "Asset ID", key: "assetId", width: 15 },
      { header: "Asset Name", key: "assetName", width: 25 },
      { header: "Category", key: "category", width: 15 },
      { header: "Type", key: "type", width: 15 },
      { header: "Serial Number", key: "serialNumber", width: 20 },
      { header: "Office Tag No", key: "officeTagNo", width: 20 },
      { header: "Purchase Date", key: "purchaseDate", width: 15 },
      { header: "Purchase Cost (INR)", key: "purchaseCost", width: 18 },
      { header: "Vendor", key: "vendorName", width: 20 },
      { header: "Warranty Expiry", key: "warrantyExpiry", width: 15 },
      { header: "Location", key: "location", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Condition", key: "condition", width: 15 },
      { header: "Description", key: "description", width: 30 },
    ];
    for (const a of assets) {
      ws.addRow({
        assetId: a.assetId,
        assetName: a.assetName,
        category: a.category,
        type: a.type,
        serialNumber: a.serialNumber,
        officeTagNo: a.officeTagNo ?? "",
        purchaseDate: isoDate(a.purchaseDate),
        purchaseCost: a.purchaseCost ?? "",
        vendorName: a.vendorRelation?.vendorName ?? "",
        warrantyExpiry: isoDate(a.warrantyExpiry),
        location: a.location ?? "",
        status: a.status,
        condition: a.condition,
        description: a.description ?? "",
      });
    }
    return sendWorkbook(reply, wb, "asset_inventory.xlsx");
  });

  app.get("/api/assets/allocations/export", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (_req, reply) => {
    const rows = await prisma.assetAllocation.findMany({
      where: { inventory: { isDeleted: false } },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeId: true, department: true } },
        inventory: true,
      },
      orderBy: { allocatedAt: "desc" },
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Asset Allocations");
    ws.columns = [
      { header: "Employee Name", key: "employeeName", width: 25 },
      { header: "Employee ID", key: "employeeId", width: 15 },
      { header: "Department", key: "department", width: 20 },
      { header: "Asset Name", key: "assetName", width: 25 },
      { header: "Serial Number", key: "serialNumber", width: 20 },
      { header: "Office Tag No", key: "officeTagNo", width: 20 },
      { header: "Category", key: "category", width: 15 },
      { header: "Type", key: "type", width: 15 },
      { header: "Allocated At", key: "allocatedAt", width: 18 },
      { header: "Status", key: "status", width: 12 },
      { header: "Remarks", key: "remarks", width: 35 },
    ];
    for (const r of rows) {
      ws.addRow({
        employeeName: r.employee ? `${r.employee.firstName} ${r.employee.lastName ?? ""}`.trim() : "Unassigned",
        employeeId: r.employee?.employeeId ?? "",
        department: r.employee?.department ?? "",
        assetName: r.inventory?.assetName ?? "",
        serialNumber: r.inventory?.serialNumber ?? "",
        officeTagNo: r.inventory?.officeTagNo ?? "",
        category: r.inventory?.category ?? "",
        type: r.inventory?.type ?? "",
        allocatedAt: isoDate(r.allocatedAt),
        status: r.status,
        remarks: r.remarks ?? "",
      });
    }
    return sendWorkbook(reply, wb, "asset_allocations_export.xlsx");
  });

  app.get("/api/assets/allocations", { preHandler: [authenticate] }, async (_req, reply) => {
    const rows = await prisma.assetAllocation.findMany({
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, department: true } },
        inventory: { include: { vendorRelation: true } },
      },
      orderBy: { allocatedAt: "desc" },
    });
    return reply.send({ success: true, data: rows });
  });

  app.get("/api/assets/my-allocations", { preHandler: [authenticate] }, async (req, reply) => {
    const rows = await prisma.assetAllocation.findMany({
      where: { employeeId: req.user!.id },
      include: {
        inventory: { include: { vendorRelation: true } },
      },
      orderBy: { allocatedAt: "desc" },
    });
    return reply.send({ success: true, data: rows });
  });

  app.post("/api/assets/allocations/assign", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const { employeeId, inventoryId, remarks } = (req.body ?? {}) as {
      employeeId?: string;
      inventoryId?: string;
      remarks?: string;
    };
    if (!employeeId || !inventoryId) {
      return reply.code(400).send({ success: false, message: "employeeId and inventoryId are required." });
    }

    const inv = await prisma.assetInventory.findUnique({ where: { id: inventoryId } });
    if (!inv || inv.status !== "Available") {
      return reply.code(400).send({ success: false, message: "Selected asset is not available for assignment." });
    }

    const requestIdCode = await nextRequestCode("DIR");
    const result = await prisma.$transaction(async (tx) => {
      const dirReq = await tx.assetRequest.create({
        data: {
          requestId: requestIdCode,
          employeeId,
          assetType: inv.type,
          assetCategory: inv.category,
          title: `Direct assignment: ${inv.assetName}`,
          status: "Allocated",
          approvedBy: req.user!.id,
          approvedAt: new Date(),
        },
      });

      const alloc = await tx.assetAllocation.create({
        data: {
          requestId: dirReq.id,
          inventoryId,
          employeeId,
          status: "Allocated",
          remarks: remarks ?? null,
        },
        include: {
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, department: true } },
          inventory: { include: { vendorRelation: true } },
        },
      });

      await tx.assetInventory.update({
        where: { id: inventoryId },
        data: { status: "Allocated" },
      });

      return alloc;
    });

    await createNotification({
      userId: employeeId,
      title: "Asset Assigned",
      message: `${inv.assetName} (${inv.serialNumber}) has been assigned to you.`,
      type: "asset_assigned",
      module: "IT",
      actionUrl: "/admin/asset-management",
    });

    return reply.code(201).send({ success: true, data: result });
  });

  // PATCH /api/assets/allocations/:id/return — fixes AS9 (updates request status when returned)
  app.patch("/api/assets/allocations/:id/return", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { condition, remarks } = (req.body ?? {}) as { condition?: string; remarks?: string };

    const alloc = await prisma.assetAllocation.findUnique({ where: { id } });
    if (!alloc) return reply.code(404).send({ success: false, message: "Allocation not found." });

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.assetAllocation.update({
        where: { id },
        data: {
          status: "Returned",
          returnedAt: now,
          remarks: remarks ?? alloc.remarks,
        },
      });

      await tx.assetInventory.update({
        where: { id: alloc.inventoryId },
        data: {
          status: "Available",
          ...(condition ? { condition } : {}),
        },
      });

      if (alloc.requestId) {
        const remaining = await tx.assetAllocation.count({
          where: { requestId: alloc.requestId, status: { not: "Returned" } },
        });
        if (remaining === 0) {
          await tx.assetRequest.update({
            where: { id: alloc.requestId },
            data: { status: "Returned" },
          });
        }
      }
    });

    return reply.send({ success: true, message: "Asset returned to inventory." });
  });

  // POST /api/assets/allocations/:id/transfer
  app.post("/api/assets/allocations/:id/transfer", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { employeeId, remarks } = (req.body ?? {}) as { employeeId?: string; remarks?: string };
    if (!employeeId) return reply.code(400).send({ success: false, message: "Target employeeId is required." });

    const alloc = await prisma.assetAllocation.findUnique({ where: { id } });
    if (!alloc) return reply.code(404).send({ success: false, message: "Allocation not found." });

    const now = new Date();
    const newAlloc = await prisma.$transaction(async (tx) => {
      await tx.assetAllocation.update({
        where: { id },
        data: { status: "Returned", returnedAt: now },
      });

      return tx.assetAllocation.create({
        data: {
          requestId: alloc.requestId,
          inventoryId: alloc.inventoryId,
          employeeId,
          status: "Allocated",
          remarks: remarks ?? "Transferred",
        },
        include: {
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, department: true } },
          inventory: { include: { vendorRelation: true } },
        },
      });
    });

    return reply.send({ success: true, data: newAlloc });
  });

  // ── Maintenance ────────────────────────────────────────────────────────────
  app.get("/api/assets/maintenance", { preHandler: [authenticate] }, async (_req, reply) => {
    const rows = await prisma.assetMaintenance.findMany({
      include: {
        inventory: { select: { id: true, assetName: true, serialNumber: true, officeTagNo: true } },
      },
      orderBy: { date: "desc" },
    });
    return reply.send({ success: true, data: rows });
  });

  app.post("/api/assets/maintenance", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const { inventoryId, type, date, cost, description } = (req.body ?? {}) as {
      inventoryId?: string;
      type?: string;
      date?: string;
      cost?: number;
      description?: string;
    };
    if (!inventoryId || !type || !date) {
      return reply.code(400).send({ success: false, message: "inventoryId, type, and date are required." });
    }
    const inv = await prisma.assetInventory.findUnique({ where: { id: inventoryId } });
    const created = await prisma.$transaction(async (tx) => {
      const m = await tx.assetMaintenance.create({
        data: {
          inventoryId,
          type,
          date: new Date(date),
          cost: cost != null ? Number(cost) : null,
          description: description ?? null,
          status: "In Progress",
          previousStatus: inv?.status ?? "Available",
        },
      });
      await tx.assetInventory.update({
        where: { id: inventoryId },
        data: { status: "Maintenance" },
      });
      return m;
    });
    return reply.code(201).send({ success: true, data: created });
  });

  app.put("/api/assets/maintenance/:id", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = (req.body ?? {}) as { status?: string };
    if (!status) return reply.code(400).send({ success: false, message: "status is required." });

    const existing = await prisma.assetMaintenance.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ success: false, message: "Maintenance record not found." });

    const updated = await prisma.assetMaintenance.update({
      where: { id },
      data: { status },
    });
    if (status === "Completed") {
      await prisma.assetInventory.update({
        where: { id: existing.inventoryId },
        data: { status: existing.previousStatus || "Available" },
      });
    }
    return reply.send({ success: true, data: updated });
  });

  // ── Vendors ────────────────────────────────────────────────────────────────
  app.get("/api/assets/vendors", { preHandler: [authenticate] }, async (_req, reply) => {
    const rows = await prisma.vendor.findMany({ orderBy: { vendorName: "asc" } });
    return reply.send({ success: true, data: rows });
  });

  app.post("/api/assets/vendors", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.vendorName || !b.company) {
      return reply.code(400).send({ success: false, message: "vendorName and company are required." });
    }
    const created = await prisma.vendor.create({
      data: {
        vendorName: String(b.vendorName).trim(),
        company: String(b.company).trim(),
        email: b.email || null,
        phone: b.phone || null,
        address: b.address || null,
        gstNumber: b.gstNumber || null,
        contactPerson: b.contactPerson || null,
      },
    });
    return reply.code(201).send({ success: true, data: created });
  });

  app.put("/api/assets/vendors/:id", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, any>;
    const updated = await prisma.vendor.update({
      where: { id },
      data: {
        ...(b.vendorName !== undefined ? { vendorName: String(b.vendorName).trim() } : {}),
        ...(b.company !== undefined ? { company: String(b.company).trim() } : {}),
        ...(b.email !== undefined ? { email: b.email || null } : {}),
        ...(b.phone !== undefined ? { phone: b.phone || null } : {}),
        ...(b.address !== undefined ? { address: b.address || null } : {}),
        ...(b.gstNumber !== undefined ? { gstNumber: b.gstNumber || null } : {}),
        ...(b.contactPerson !== undefined ? { contactPerson: b.contactPerson || null } : {}),
      },
    });
    return reply.send({ success: true, data: updated });
  });

  app.delete("/api/assets/vendors/:id", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.vendor.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // ── Asset Masters (categories, types, locations) ───────────────────────────
  app.get("/api/assets/masters/categories", { preHandler: [authenticate] }, async (_req, reply) => {
    const data = await prisma.assetCategory.findMany({ orderBy: { name: "asc" } });
    return reply.send({ success: true, data });
  });

  app.post("/api/assets/masters/categories", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const { name, category } = (req.body ?? {}) as { name?: string; category?: string };
    if (!name?.trim()) return reply.code(400).send({ success: false, message: "Name is required." });
    const created = await prisma.assetCategory.create({
      data: { name: name.trim(), category: category || "Hardware" },
    });
    return reply.code(201).send({ success: true, data: created });
  });

  app.delete("/api/assets/masters/categories/:id", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.assetCategory.delete({ where: { id } });
    return reply.send({ success: true });
  });

  app.get("/api/assets/masters/types", { preHandler: [authenticate] }, async (_req, reply) => {
    const data = await prisma.assetType.findMany({
      include: { category: true },
      orderBy: { name: "asc" },
    });
    return reply.send({ success: true, data });
  });

  app.post("/api/assets/masters/types", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const b = (req.body ?? {}) as { name?: string; assetCategoryId?: string; categoryId?: string };
    const name = b.name;
    const assetCategoryId = b.assetCategoryId ?? b.categoryId;
    if (!name?.trim() || !assetCategoryId) {
      return reply.code(400).send({ success: false, message: "Enter a type name and choose its category." });
    }
    const created = await prisma.assetType.create({
      data: { name: name.trim(), assetCategoryId },
      include: { category: true },
    });
    return reply.code(201).send({ success: true, data: created });
  });

  app.delete("/api/assets/masters/types/:id", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.assetType.delete({ where: { id } });
    return reply.send({ success: true });
  });

  app.get("/api/assets/masters/locations", { preHandler: [authenticate] }, async (_req, reply) => {
    const data = await prisma.location.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
    return reply.send({ success: true, data });
  });

  app.post("/api/assets/masters/locations", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const { name, description } = (req.body ?? {}) as { name?: string; description?: string };
    if (!name?.trim()) return reply.code(400).send({ success: false, message: "Name is required." });
    const created = await prisma.location.create({
      data: { name: name.trim(), description: description || null },
    });
    return reply.code(201).send({ success: true, data: created });
  });

  app.delete("/api/assets/masters/locations/:id", { preHandler: [requireRoles(ASSET_ADMIN_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.location.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // ── Asset Requests (fixes AS7, AS8) ────────────────────────────────────────
  app.get("/api/asset-requests/my-requests", { preHandler: [authenticate] }, async (req, reply) => {
    const rows = await prisma.assetRequest.findMany({
      where: { employeeId: req.user!.id },
      include: {
        approver: { select: { firstName: true, lastName: true } },
        allocations: { include: { inventory: { include: { vendorRelation: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ success: true, data: rows });
  });

  app.get(
    "/api/asset-requests/all-requests",
    { preHandler: [requireRoles(["admin", "owner", "hr", "it"])] },
    async (_req, reply) => {
      const rows = await prisma.assetRequest.findMany({
        include: {
          employee: { select: { firstName: true, lastName: true, employeeId: true, department: true } },
          approver: { select: { firstName: true, lastName: true } },
          allocations: { include: { inventory: { include: { vendorRelation: true } } } },
        },
        orderBy: { createdAt: "desc" },
      });
      return reply.send({ success: true, data: rows });
    },
  );

  app.post("/api/asset-requests/requests", { preHandler: [authenticate] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const assetType = String(b.assetType ?? "").trim();
    const title = String(b.title ?? b.reason ?? assetType).trim();
    if (!assetType || !title) {
      return reply.code(400).send({
        success: false,
        message: "assetType and title/reason are required.",
      });
    }

    const requestId = await nextRequestCode("REQ");
    const created = await prisma.assetRequest.create({
      data: {
        requestId,
        employeeId: req.user!.id,
        assetType,
        assetCategory: String(b.assetCategory ?? "Hardware"),
        title,
        description: b.description ? String(b.description) : null,
        priority: String(b.priority ?? "Medium"),
        requiredDate: b.requiredDate ? new Date(b.requiredDate) : null,
        quantity: Number(b.quantity ?? 1) || 1,
        deliveryLocation: b.deliveryLocation ? String(b.deliveryLocation) : null,
        status: "Pending",
      },
    });
    return reply.code(201).send({ success: true, data: created });
  });

  app.patch(
    "/api/asset-requests/requests/:id/status",
    { preHandler: [requireRoles(["admin", "owner", "hr", "it"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { status, remarks } = (req.body ?? {}) as { status?: string; remarks?: string };
      if (!status || !["Approved", "Rejected"].includes(status)) {
        return reply.code(400).send({ success: false, message: "status must be 'Approved' or 'Rejected'." });
      }
      const updated = await prisma.assetRequest.update({
        where: { id },
        data: {
          status,
          remarks: remarks ?? null,
          approvedBy: req.user!.id,
          approvedAt: new Date(),
        },
      });
      return reply.send({ success: true, data: updated });
    },
  );

  app.post(
    "/api/asset-requests/allocate",
    { preHandler: [requireRoles(["admin", "owner", "hr", "it"])] },
    async (req, reply) => {
      const { requestId, inventoryId, remarks } = (req.body ?? {}) as {
        requestId?: string;
        inventoryId?: string;
        remarks?: string;
      };
      if (!requestId || !inventoryId) {
        return reply.code(400).send({ success: false, message: "requestId and inventoryId are required." });
      }

      const [reqRow, inv] = await Promise.all([
        prisma.assetRequest.findUnique({ where: { id: requestId } }),
        prisma.assetInventory.findUnique({ where: { id: inventoryId } }),
      ]);
      if (!reqRow) return reply.code(404).send({ success: false, message: "Asset request not found." });
      if (!inv || inv.status !== "Available") {
        return reply.code(400).send({ success: false, message: "Selected inventory item is not available." });
      }

      const alloc = await prisma.$transaction(async (tx) => {
        const a = await tx.assetAllocation.create({
          data: {
            requestId: reqRow.id,
            inventoryId: inv.id,
            employeeId: reqRow.employeeId,
            status: "Allocated",
            remarks: remarks ?? null,
          },
          include: { inventory: true },
        });
        await tx.assetInventory.update({
          where: { id: inv.id },
          data: { status: "Allocated" },
        });
        await tx.assetRequest.update({
          where: { id: reqRow.id },
          data: {
            status: "Allocated",
            approvedBy: req.user!.id,
            approvedAt: new Date(),
          },
        });
        return a;
      });

      await createNotification({
        userId: reqRow.employeeId,
        title: "Asset Request Fulfilled",
        message: `${inv.assetName} (${inv.serialNumber}) has been allocated for your request ${reqRow.requestId}.`,
        type: "asset_allocated",
        module: "IT",
        actionUrl: "/admin/asset-management",
      });

      return reply.send({ success: true, data: alloc });
    },
  );
}
