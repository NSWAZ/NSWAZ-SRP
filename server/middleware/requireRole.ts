import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

type Role = "member" | "fc" | "admin";

const ROLE_HIERARCHY: Record<Role, number> = {
  member: 1,
  fc: 2,
  admin: 3,
};

export function requireRole(minimumRole: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.session.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userRole = await storage.getUserRole(user.seatUserId);
      
      if (!userRole) {
        return res.status(403).json({ message: "No role assigned" });
      }

      const userRoleLevel = ROLE_HIERARCHY[userRole.role as Role] || 0;
      const requiredLevel = ROLE_HIERARCHY[minimumRole];

      if (userRoleLevel < requiredLevel) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      next();
    } catch (error) {
      console.error("Error checking role:", error);
      res.status(500).json({ message: "Failed to verify permissions" });
    }
  };
}
