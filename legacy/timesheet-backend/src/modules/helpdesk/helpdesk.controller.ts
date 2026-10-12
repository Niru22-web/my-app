import { Request, Response } from "express";
import * as helpdeskService from "./helpdesk.service";

/**
 * GET /api/helpdesk/categories (tree or flat list)
 */
export const getCategories = async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;
    const categories = await helpdeskService.getCategoriesTree(
      status ? String(status) : undefined,
      search ? String(search) : undefined
    );
    return res.json({ success: true, data: categories });
  } catch (error: any) {
    console.error("Error fetching categories:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch categories", error: error.message });
  }
};

/**
 * GET /api/helpdesk/categories/tree (active categories tree for dropdown)
 */
export const getCategoryTree = async (req: Request, res: Response) => {
  try {
    const categories = await helpdeskService.getCategoriesTree("active");
    return res.json({ success: true, data: categories });
  } catch (error: any) {
    console.error("Error fetching category tree:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch category tree", error: error.message });
  }
};

/**
 * GET /api/helpdesk/categories/:id
 */
export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid category ID format" });
    }

    const category = await helpdeskService.getCategoryById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    return res.json({ success: true, data: category });
  } catch (error: any) {
    console.error("Error fetching category:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch category", error: error.message });
  }
};

/**
 * GET /api/helpdesk/subcategories/:id (compatibility alias)
 */
export const getSubcategories = async (req: Request, res: Response) => {
  try {
    const parentId = parseInt(req.params.id, 10);
    if (isNaN(parentId)) {
      return res.status(400).json({ success: false, message: "Invalid parent category ID" });
    }

    const subcategories = await helpdeskService.getSubcategoriesByParentId(parentId);
    return res.json({ success: true, data: subcategories });
  } catch (error: any) {
    console.error("Error fetching subcategories:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch subcategories", error: error.message });
  }
};

/**
 * POST /api/helpdesk/categories
 */
export const createCategory = async (req: any, res: Response) => {
  try {
    const user = req.user;
    if (!user || user.role?.toLowerCase() !== "admin") {
      return res.status(403).json({ success: false, message: "Forbidden: Only admins can manage category configurations" });
    }

    const { category_name, categoryName, description, parent_id, parentId, display_order, displayOrder, is_active, isActive, assigned_team, assignedTeam, sla_hours, slaHours, support_email, supportEmail, cc_email, ccEmail, escalation_email, escalationEmail, auto_assign_user_id, autoAssignUserId } = req.body;

    const name = (category_name || categoryName || "").trim();
    const desc = description ? description.trim() : null;
    
    // Support parsing fields from both snake_case and camelCase payloads
    const parent = parent_id !== undefined ? parent_id : parentId;
    const finalParentId = parent ? parseInt(parent, 10) : null;
    
    const order = display_order !== undefined ? display_order : displayOrder;
    const finalDisplayOrder = order ? parseInt(order, 10) : 0;
    
    const active = is_active !== undefined ? is_active : isActive;
    const finalIsActive = active !== undefined ? Boolean(active) : true;

    const team = assigned_team !== undefined ? assigned_team : assignedTeam;
    const sla = sla_hours !== undefined ? sla_hours : slaHours;
    const finalSlaHours = sla !== undefined ? parseInt(sla, 10) : 24;

    const supportMail = support_email !== undefined ? support_email : supportEmail;
    const ccMail = cc_email !== undefined ? cc_email : ccEmail;
    const escalationMail = escalation_email !== undefined ? escalation_email : escalationEmail;
    const autoAssignUser = auto_assign_user_id !== undefined ? auto_assign_user_id : autoAssignUserId;

    const newCategory = await helpdeskService.createCategory({
      category_name: name,
      description: desc,
      parent_id: isNaN(finalParentId as any) ? null : finalParentId,
      display_order: isNaN(finalDisplayOrder) ? 0 : finalDisplayOrder,
      is_active: finalIsActive,
      assigned_team: team || null,
      sla_hours: isNaN(finalSlaHours) ? 24 : finalSlaHours,
      support_email: supportMail ? String(supportMail).trim() : null,
      cc_email: ccMail ? String(ccMail).trim() : null,
      escalation_email: escalationMail ? String(escalationMail).trim() : null,
      auto_assign_user_id: autoAssignUser ? String(autoAssignUser).trim() : null,
      created_by: user.id
    });

    return res.json({ success: true, message: "Category created successfully", data: newCategory });
  } catch (error: any) {
    console.error("Error creating category:", error);
    return res.status(500).json({ success: false, message: "Failed to create category", error: error.message });
  }
};

/**
 * PUT /api/helpdesk/categories/:id (also supports old /categories/update endpoint)
 */
export const updateCategory = async (req: any, res: Response) => {
  try {
    const user = req.user;
    if (!user || user.role?.toLowerCase() !== "admin") {
      return res.status(403).json({ success: false, message: "Forbidden: Only admins can manage category configurations" });
    }

    const idVal = req.params.id || req.body.id || req.query.id;
    const id = parseInt(idVal, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Category ID is required and must be a number" });
    }

    const existing = await helpdeskService.getCategoryById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    const { category_name, categoryName, description, parent_id, parentId, display_order, displayOrder, is_active, isActive, assigned_team, assignedTeam, sla_hours, slaHours, support_email, supportEmail, cc_email, ccEmail, escalation_email, escalationEmail, auto_assign_user_id, autoAssignUserId } = req.body;

    const updateData: any = {};
    if (category_name !== undefined || categoryName !== undefined) {
      updateData.category_name = (category_name || categoryName || "").trim();
    }
    if (description !== undefined) {
      updateData.description = description ? description.trim() : null;
    }
    if (parent_id !== undefined || parentId !== undefined) {
      const parent = parent_id !== undefined ? parent_id : parentId;
      updateData.parent_id = parent ? parseInt(parent, 10) : null;
      if (isNaN(updateData.parent_id)) updateData.parent_id = null;
    }
    if (display_order !== undefined || displayOrder !== undefined) {
      const order = display_order !== undefined ? display_order : displayOrder;
      updateData.display_order = order ? parseInt(order, 10) : 0;
      if (isNaN(updateData.display_order)) updateData.display_order = 0;
    }
    if (is_active !== undefined || isActive !== undefined) {
      const active = is_active !== undefined ? is_active : isActive;
      updateData.is_active = Boolean(active);
    }
    if (assigned_team !== undefined || assignedTeam !== undefined) {
      updateData.assigned_team = assigned_team !== undefined ? assigned_team : assignedTeam;
    }
    if (sla_hours !== undefined || slaHours !== undefined) {
      const sla = sla_hours !== undefined ? sla_hours : slaHours;
      const parsedSla = parseInt(sla, 10);
      updateData.sla_hours = isNaN(parsedSla) ? 24 : parsedSla;
    }
    if (support_email !== undefined || supportEmail !== undefined) {
      const mail = support_email !== undefined ? support_email : supportEmail;
      updateData.support_email = mail ? String(mail).trim() : null;
    }
    if (cc_email !== undefined || ccEmail !== undefined) {
      const mail = cc_email !== undefined ? cc_email : ccEmail;
      updateData.cc_email = mail ? String(mail).trim() : null;
    }
    if (escalation_email !== undefined || escalationEmail !== undefined) {
      const mail = escalation_email !== undefined ? escalation_email : escalationEmail;
      updateData.escalation_email = mail ? String(mail).trim() : null;
    }
    if (auto_assign_user_id !== undefined || autoAssignUserId !== undefined) {
      const userVal = auto_assign_user_id !== undefined ? auto_assign_user_id : autoAssignUserId;
      updateData.auto_assign_user_id = userVal ? String(userVal).trim() : null;
    }

    const updated = await helpdeskService.updateCategory(id, updateData);
    return res.json({ success: true, message: "Category updated successfully", data: updated });
  } catch (error: any) {
    console.error("Error updating category:", error);
    return res.status(500).json({ success: false, message: "Failed to update category", error: error.message });
  }
};

/**
 * DELETE /api/helpdesk/categories/:id (also supports old /categories/delete/:id endpoint)
 */
export const deleteCategory = async (req: any, res: Response) => {
  try {
    const user = req.user;
    if (!user || user.role?.toLowerCase() !== "admin") {
      return res.status(403).json({ success: false, message: "Forbidden: Only admins can manage category configurations" });
    }

    const idVal = req.params.id || req.body.id || req.query.id;
    const id = parseInt(idVal, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Category ID is required and must be a number" });
    }

    const existing = await helpdeskService.getCategoryById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    await helpdeskService.deleteCategory(id);
    return res.json({ success: true, message: "Category deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting category:", error);
    return res.status(500).json({ success: false, message: "Failed to delete category", error: error.message });
  }
};
