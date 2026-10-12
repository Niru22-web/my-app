import { Router } from "express";
import {
  getCategories,
  getCategoryTree,
  getCategoryById,
  getSubcategories,
  createCategory,
  updateCategory,
  deleteCategory
} from "./helpdesk.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

// Required category endpoints
router.get("/categories", authenticate, getCategories);
router.get("/categories/tree", authenticate, getCategoryTree);
router.get("/categories/:id", authenticate, getCategoryById);
router.post("/categories", authenticate, createCategory);
router.put("/categories/:id", authenticate, updateCategory);
router.delete("/categories/:id", authenticate, deleteCategory);

// Compatibility aliases for the CategoryMaster frontend pages
router.get("/subcategories/:id", authenticate, getSubcategories);
router.post("/categories/create", authenticate, createCategory);
router.put("/categories/update", authenticate, updateCategory);
router.put("/categories/update/:id", authenticate, updateCategory);
router.delete("/categories/delete/:id", authenticate, deleteCategory);
router.delete("/categories/delete", authenticate, deleteCategory);

export default router;
