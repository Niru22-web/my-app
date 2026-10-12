export const authorizeRoles = (...roles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ 
        success: false,
        message: "Access denied: No user role found" 
      });
    }
    
    // Case-insensitive role checking to be robust
    const userRole = req.user.role.toLowerCase();
    const allowedRoles = roles.map(role => role.toLowerCase());
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }
    
    next();
  };
};

// Keeping original authorize for backward compatibility if needed
export const authorize = (roles: string[]) => authorizeRoles(...roles);
export const allowRoles = (...allowedRoles: string[]) => authorizeRoles(...allowedRoles);