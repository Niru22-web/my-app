import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const authenticate = (req: any, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  let token = "";
  
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.query && req.query.token) {
    token = req.query.token as string;
  }
  
  // For development, allow requests without token but with a mock user
  if (!token && process.env.NODE_ENV === 'development') {
    console.log(' Development mode: Allowing request without authentication');
    req.user = {
      id: '3e1c5782-6cf5-42e6-8649-45d7383e516c',
      role: 'Admin',
      employeeId: 'EMP001'
    };
    return next();
  }

  if (!token) return res.status(401).json({ message: "Unauthorized" });


  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
    
    if (!decoded) {
      return res.status(401).json({ 
        success: false,
        message: "User not authenticated" 
      });
    }

    if (!decoded.employeeId) {
      console.error("Missing employeeId in token payload:", decoded);
      return res.status(400).json({
        success: false,
        message: "Employee ID missing in authentication token"
      });
    }

    req.user = decoded;
    next();
  } catch (err: any) {
    console.error("Token verification error:", err.message);
    return res.status(401).json({ 
      success: false,
      message: "Invalid token",
      error: err.message
    });
  }
};

export const checkManagerRole = (req: any, res: Response, next: NextFunction) => {
  authenticate(req, res, () => {
    const userRole = (req.user?.role as string)?.toLowerCase();
    if (['manager', 'admin', 'partner', 'owner', 'hr', 'accounts'].includes(userRole)) {
      next();
    } else {
      res.status(403).json({ error: "Access denied. Action restricted to Managers/Admins/Partners/Owners/HR." });
    }
  });
};