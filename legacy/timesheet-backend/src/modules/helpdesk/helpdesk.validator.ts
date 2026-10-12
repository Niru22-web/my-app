import { Request, Response, NextFunction } from "express";

/**
 * Middleware to validate category fields on POST/PUT requests
 */
export const validateCategory = (req: Request, res: Response, next: NextFunction) => {
  const { category_name, categoryName, display_order, displayOrder, parent_id, parentId, is_active, isActive } = req.body;

  // Support both camelCase and snake_case properties from payload
  const finalCategoryName = category_name || categoryName;
  const finalDisplayOrder = display_order !== undefined ? display_order : displayOrder;
  const finalParentId = parent_id !== undefined ? parent_id : parentId;

  if (!finalCategoryName || typeof finalCategoryName !== "string" || !finalCategoryName.trim()) {
    return res.status(400).json({ success: false, message: "Category name is required" });
  }

  if (finalDisplayOrder !== undefined && isNaN(Number(finalDisplayOrder))) {
    return res.status(400).json({ success: false, message: "Display order must be a valid number" });
  }

  if (finalParentId !== undefined && finalParentId !== null && finalParentId !== "" && isNaN(Number(finalParentId))) {
    return res.status(400).json({ success: false, message: "Parent ID must be a valid number" });
  }

  next();
};
