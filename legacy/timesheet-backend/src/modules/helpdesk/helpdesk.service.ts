import { prisma } from "../../config/prisma";

interface CategoryInput {
  category_name: string;
  description?: string | null;
  parent_id?: number | null;
  display_order?: number;
  is_active?: boolean;
  created_by?: string | null;
  assigned_team?: string | null;
  sla_hours?: number | null;
  support_email?: string | null;
  cc_email?: string | null;
  escalation_email?: string | null;
  auto_assign_user_id?: string | null;
}

/**
 * Format category to support both camelCase and snake_case attributes
 */
export const formatCategory = (c: any, parentCtx?: any): any => {
  if (!c) return c;
  
  const actualParent = parentCtx || c.parent;
  
  // Resolve inheritance from parent context if fields are null/undefined
  const supportEmail = c.support_email || (actualParent ? actualParent.support_email : null);
  const ccEmail = c.cc_email || (actualParent ? actualParent.cc_email : null);
  const escalationEmail = c.escalation_email || (actualParent ? actualParent.escalation_email : null);
  const autoAssignUserId = c.auto_assign_user_id || (actualParent ? actualParent.auto_assign_user_id : null);
  const assignedTeam = c.assigned_team || (actualParent ? actualParent.assigned_team : null);
  const slaHours = c.sla_hours !== null && c.sla_hours !== undefined 
    ? c.sla_hours 
    : (actualParent && actualParent.sla_hours !== null && actualParent.sla_hours !== undefined ? actualParent.sla_hours : null);

  const childrenList = c.children ? c.children.map((child: any) => formatCategory(child, c)) : [];
  
  // Dynamic fallback for assigned team based on name search
  let fallbackTeam = assignedTeam;
  if (!fallbackTeam && c.category_name) {
    const nameLower = c.category_name.toLowerCase();
    if (nameLower.includes("hr")) {
      fallbackTeam = "HR";
    } else if (nameLower.includes("finance") || nameLower.includes("salary") || nameLower.includes("reimbursement")) {
      fallbackTeam = "Finance";
    } else if (nameLower.includes("admin") || nameLower.includes("seating") || nameLower.includes("asset")) {
      fallbackTeam = "Admin";
    } else {
      fallbackTeam = "IT";
    }
  }

  return {
    id: c.id,
    category_name: c.category_name,
    categoryName: c.category_name,
    description: c.description,
    is_active: c.is_active,
    isActive: c.is_active,
    display_order: c.display_order,
    displayOrder: c.display_order,
    parent_id: c.parent_id,
    parentId: c.parent_id,
    assigned_team: fallbackTeam || "IT",
    assignedTeam: fallbackTeam || "IT",
    sla_hours: slaHours ?? 24,
    slaHours: slaHours ?? 24,
    support_email: supportEmail,
    supportEmail: supportEmail,
    cc_email: ccEmail,
    ccEmail: ccEmail,
    escalation_email: escalationEmail,
    escalationEmail: escalationEmail,
    auto_assign_user_id: autoAssignUserId,
    autoAssignUserId: autoAssignUserId,
    created_by: c.created_by,
    createdBy: c.created_by,
    created_at: c.created_at,
    createdAt: c.created_at,
    updated_at: c.updated_at,
    updatedAt: c.updated_at,
    children: childrenList,
    subcategories: childrenList
  };
};

/**
 * Get categories list (tree structure) or filtered flat list
 */
export const getCategoriesTree = async (status?: string, search?: string) => {
  const where: any = {};
  if (status === "active") {
    where.is_active = true;
  } else if (status === "inactive") {
    where.is_active = false;
  }

  if (search) {
    where.category_name = {
      contains: search,
      mode: "insensitive"
    };
    const categories = await prisma.helpdeskCategory.findMany({
      where,
      include: { parent: true },
      orderBy: { display_order: "asc" }
    });
    return categories.map(c => formatCategory(c, c.parent));
  }

  // Retrieve nested tree structure (main categories with subcategories)
  const parents = await prisma.helpdeskCategory.findMany({
    where: {
      ...where,
      parent_id: null
    },
    orderBy: { display_order: "asc" },
    include: {
      children: {
        where: status === "active" ? { is_active: true } : status === "inactive" ? { is_active: false } : undefined,
        orderBy: { display_order: "asc" },
        include: {
          children: {
            where: status === "active" ? { is_active: true } : status === "inactive" ? { is_active: false } : undefined,
            orderBy: { display_order: "asc" }
          }
        }
      }
    }
  });

  return parents.map(p => formatCategory(p));
};

/**
 * Get active subcategories of a specific category ID
 */
export const getSubcategoriesByParentId = async (parentId: number) => {
  const parent = await prisma.helpdeskCategory.findUnique({
    where: { id: parentId }
  });
  const subcategories = await prisma.helpdeskCategory.findMany({
    where: {
      parent_id: parentId,
      is_active: true
    },
    orderBy: { display_order: "asc" }
  });
  return subcategories.map(sub => formatCategory(sub, parent));
};

/**
 * Get specific category by ID
 */
export const getCategoryById = async (id: number) => {
  const category = await prisma.helpdeskCategory.findUnique({
    where: { id },
    include: {
      parent: true,
      children: {
        orderBy: { display_order: "asc" }
      }
    }
  });
  return formatCategory(category, category?.parent);
};

/**
 * Create a new category
 */
export const createCategory = async (data: CategoryInput) => {
  const category = await prisma.helpdeskCategory.create({
    data: {
      category_name: data.category_name,
      description: data.description || null,
      parent_id: data.parent_id || null,
      display_order: data.display_order ?? 0,
      is_active: data.is_active ?? true,
      assigned_team: data.assigned_team || "IT",
      sla_hours: data.sla_hours ?? 24,
      support_email: data.support_email || null,
      cc_email: data.cc_email || null,
      escalation_email: data.escalation_email || null,
      auto_assign_user_id: data.auto_assign_user_id || null,
      created_by: data.created_by || null
    },
    include: { parent: true }
  });
  return formatCategory(category, category.parent);
};

/**
 * Update an existing category.
 * If this is a parent category and email routing fields changed,
 * auto-propagate those values to subcategories that have null (no custom value set).
 * Subcategories with their own custom email are NOT overwritten.
 */
export const updateCategory = async (id: number, data: Partial<CategoryInput>) => {
  const updateData: any = {};
  if (data.category_name !== undefined) updateData.category_name = data.category_name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.parent_id !== undefined) updateData.parent_id = data.parent_id;
  if (data.display_order !== undefined) updateData.display_order = data.display_order;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;
  if (data.assigned_team !== undefined) updateData.assigned_team = data.assigned_team;
  if (data.sla_hours !== undefined) updateData.sla_hours = data.sla_hours;
  if (data.support_email !== undefined) updateData.support_email = data.support_email;
  if (data.cc_email !== undefined) updateData.cc_email = data.cc_email;
  if (data.escalation_email !== undefined) updateData.escalation_email = data.escalation_email;
  if (data.auto_assign_user_id !== undefined) updateData.auto_assign_user_id = data.auto_assign_user_id;

  const category = await prisma.helpdeskCategory.update({
    where: { id },
    data: updateData,
    include: { parent: true }
  });

  // ── Auto-propagate email routing to subcategories ─────────────────────────
  // Only propagate to children where the field is NULL (not custom-set).
  // This lets subcategories inherit parent emails by default while allowing
  // admins to override per-subcategory at any time.
  const emailChanged =
    data.support_email !== undefined ||
    data.cc_email !== undefined ||
    data.escalation_email !== undefined ||
    data.auto_assign_user_id !== undefined;

  if (emailChanged && category.parent_id === null) {
    // Propagate each non-null email field to children that still have null
    if (data.support_email !== undefined && data.support_email !== null) {
      await prisma.helpdeskCategory.updateMany({
        where: { parent_id: id, support_email: null },
        data: { support_email: data.support_email }
      });
    }
    if (data.cc_email !== undefined && data.cc_email !== null) {
      await prisma.helpdeskCategory.updateMany({
        where: { parent_id: id, cc_email: null },
        data: { cc_email: data.cc_email }
      });
    }
    if (data.escalation_email !== undefined && data.escalation_email !== null) {
      await prisma.helpdeskCategory.updateMany({
        where: { parent_id: id, escalation_email: null },
        data: { escalation_email: data.escalation_email }
      });
    }
    if (data.auto_assign_user_id !== undefined && data.auto_assign_user_id !== null) {
      await prisma.helpdeskCategory.updateMany({
        where: { parent_id: id, auto_assign_user_id: null },
        data: { auto_assign_user_id: data.auto_assign_user_id }
      });
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  return formatCategory(category, category.parent);
};

/**
 * Delete a category
 */
export const deleteCategory = async (id: number) => {
  await prisma.helpdeskCategory.delete({
    where: { id }
  });
  return true;
};
