import { Router, Request, Response } from "express";
import { createEmployee, deleteEmployee, getEmployees, getEmployeesByDepartment, updateEmployee, resendRegistrationEmail, getEmployeeById, downloadAttachment, getPartners, getManagersByPartner, toggleEmployeeStatus } from "./employee.controller";
import { completeEmployeeProfile, getEmployeeByEmail, uploadProfileDocuments, updateProfilePhoto, uploadProfilePhoto, exportEmployeesExcel, uploadExcel, importEmployeesExcel } from "./employeeProfile.controller";
import { uploadEmployeeDocument, getEmployeeDocuments, downloadEmployeeDocument, deleteEmployeeDocument, uploadDocument } from "./employeeDocuments.controller";
import { prisma } from "../../config/prisma";

const router = Router();

// Middleware to authenticate any user
const authenticate = (req: any, res: any, next: any) => {
  let token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token." });
  }
};

// Middleware to check if user is manager/admin
const checkManagerRole = (req: any, res: any, next: any) => {
  let token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
    const userRole = (decoded.role as string).toLowerCase();
    if (['manager', 'admin', 'partner', 'owner', 'hr', 'it', 'accountant', 'accounts', 'sub manager', 'sub-manager'].includes(userRole)) {
      req.user = decoded;
      next();
    } else {
      res.status(403).json({ error: "Access denied. Action restricted to Managers/Admins/Partners/Owners." });
    }
  } catch (error) {
    res.status(401).json({ error: "Invalid token." });
  }
};

// Employee document routes - more specific routes first
router.get("/documents/:documentId/download", authenticate, downloadEmployeeDocument);
router.delete("/documents/:documentId", authenticate, checkManagerRole, deleteEmployeeDocument);
router.post("/:employeeId/documents", authenticate, checkManagerRole, uploadDocument, uploadEmployeeDocument);
router.get("/:employeeId/documents", authenticate, getEmployeeDocuments);

// Employee management routes - specific routes first
router.get("/partners", authenticate, getPartners);
router.get("/managers-by-partner", authenticate, getManagersByPartner);
router.get("/by-email", authenticate, getEmployeeByEmail);
router.get("/department", authenticate, getEmployeesByDepartment);
router.get("/export-employees", authenticate, checkManagerRole, exportEmployeesExcel);
router.post("/import-employees", authenticate, checkManagerRole, uploadExcel, importEmployeesExcel);
router.get("/download/:filename", authenticate, checkManagerRole, downloadAttachment);
router.post("/resend-registration/:employeeId", authenticate, checkManagerRole, resendRegistrationEmail);
// Admin approval routes - must come before /:id route
router.get("/pending-approvals", authenticate, checkManagerRole, async (req: any, res: any) => {
  try {
    const pendingEmployees = await prisma.employee.findMany({
      where: { 
        status: { 
          in: ['pending_approval', 'pending'] 
        } 
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      success: true,
      data: pendingEmployees
    });
  } catch (error) {
    console.error("Error fetching pending approvals:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch pending approvals" 
    });
  }
});

router.post("/approve-employee/:id", authenticate, checkManagerRole, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    
    const employee = await prisma.employee.update({
      where: { id },
      data: { status: 'active' }
    });

    res.json({ 
      success: true,
      message: "Employee approved successfully",
      data: employee
    });
  } catch (error) {
    console.error("Error approving employee:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to approve employee" 
    });
  }
});

router.post("/reject-employee/:id", authenticate, checkManagerRole, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const employee = await prisma.employee.update({
      where: { id },
      data: { status: 'rejected' }
    });

    res.json({ 
      success: true,
      message: "Employee rejected successfully",
      data: {
        employee,
        reason
      }
    });
  } catch (error) {
    console.error("Error rejecting employee:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to reject employee" 
    });
  }
});

router.get("/team", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    let user = null;
    
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        user = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
      } catch (error) {
        return res.status(401).json({ error: "Invalid token" });
      }
    }

    let whereClause = {};
    
    if (user) {
      if (user.role === 'Admin' || user.role === 'admin') {
        whereClause = {};
      } else if (['manager', 'sub manager', 'sub-manager'].includes(user.role?.toLowerCase())) {
        whereClause = {
          OR: [
            { managers: { some: { managerId: user.id } } },
            { partners: { some: { partnerId: user.id } } },
            { subManagerId: user.id },
            { subManagerIds: { has: user.id } },
            { id: user.id }
          ]
        };
      } else {
        whereClause = {
          officeEmail: user.email
        };
      }
    }

    const teamMembers = await prisma.employee.findMany({
      where: whereClause as any,
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        officeEmail: true,
        designation: true,
        department: true,
        role: true,
        status: true
      }
    });
    
    res.json({
      success: true,
      data: teamMembers
    });
  } catch (error) {
    console.error("Failed to fetch team members:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch team members" 
    });
  }
});

// Employee profile completion routes
router.post("/complete-profile", uploadProfileDocuments, completeEmployeeProfile);

// Profile photo upload route
router.post("/profile-photo", authenticate, uploadProfilePhoto, updateProfilePhoto);

router.post("/", authenticate, createEmployee);
router.get("/", authenticate, getEmployees);
router.get("/:id", authenticate, getEmployeeById);
router.put("/:id", authenticate, uploadDocument, updateEmployee);
router.delete("/:id", authenticate, deleteEmployee);
router.patch("/:id/toggle-status", authenticate, checkManagerRole, toggleEmployeeStatus);

export default router;
