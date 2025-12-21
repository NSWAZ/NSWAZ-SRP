import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./eveAuth";
import { insertSrpRequestSchema, insertShipTypeSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication first
  await setupAuth(app);
  registerAuthRoutes(app);

  // Get current user's role
  app.get("/api/user/role", isAuthenticated, async (req: Request, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      let userRole = await storage.getUserRole(userId);
      
      // If no role exists, create a member role
      if (!userRole) {
        userRole = await storage.createUserRole({ userId, role: "member" });
      }

      res.json({ role: userRole.role });
    } catch (error) {
      console.error("Error getting user role:", error);
      res.status(500).json({ message: "Failed to get user role" });
    }
  });

  // Dashboard stats
  app.get("/api/stats", isAuthenticated, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({ message: "Failed to get stats" });
    }
  });

  // Ship types - public endpoints for authenticated users
  app.get("/api/ship-types", isAuthenticated, async (req, res) => {
    try {
      const ships = await storage.getShipTypes();
      res.json(ships);
    } catch (error) {
      console.error("Error getting ship types:", error);
      res.status(500).json({ message: "Failed to get ship types" });
    }
  });

  // Ship types - admin only
  app.post("/api/ship-types", isAuthenticated, async (req: Request, res) => {
    try {
      const userId = req.session.userId!;
      const userRole = await storage.getUserRole(userId);
      
      if (!userRole || !["admin", "fc"].includes(userRole.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const validated = insertShipTypeSchema.parse(req.body);
      const ship = await storage.createShipType(validated);
      res.status(201).json(ship);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating ship type:", error);
      res.status(500).json({ message: "Failed to create ship type" });
    }
  });

  app.patch("/api/ship-types/:id", isAuthenticated, async (req: Request, res) => {
    try {
      const userId = req.session.userId!;
      const userRole = await storage.getUserRole(userId);
      
      if (!userRole || !["admin", "fc"].includes(userRole.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { id } = req.params;
      const validated = insertShipTypeSchema.partial().parse(req.body);
      const ship = await storage.updateShipType(id, validated);
      
      if (!ship) {
        return res.status(404).json({ message: "Ship type not found" });
      }
      
      res.json(ship);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error updating ship type:", error);
      res.status(500).json({ message: "Failed to update ship type" });
    }
  });

  app.delete("/api/ship-types/:id", isAuthenticated, async (req: Request, res) => {
    try {
      const userId = req.session.userId!;
      const userRole = await storage.getUserRole(userId);
      
      if (!userRole || !["admin", "fc"].includes(userRole.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { id } = req.params;
      const deleted = await storage.deleteShipType(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Ship type not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting ship type:", error);
      res.status(500).json({ message: "Failed to delete ship type" });
    }
  });

  // SRP Requests - user's own requests (recent for dashboard)
  app.get("/api/srp-requests/my/recent", isAuthenticated, async (req: Request, res) => {
    try {
      const userId = req.session.userId!;
      const requests = await storage.getSrpRequests(userId);
      res.json(requests.slice(0, 5));
    } catch (error) {
      console.error("Error getting recent requests:", error);
      res.status(500).json({ message: "Failed to get requests" });
    }
  });

  // SRP Requests - user's own requests (all)
  app.get("/api/srp-requests/my", isAuthenticated, async (req: Request, res) => {
    try {
      const userId = req.session.userId!;
      const requests = await storage.getSrpRequests(userId);
      res.json(requests);
    } catch (error) {
      console.error("Error getting requests:", error);
      res.status(500).json({ message: "Failed to get requests" });
    }
  });

  // SRP Requests - all requests (admin only)
  app.get("/api/srp-requests/all/:status?", isAuthenticated, async (req: Request, res) => {
    try {
      const userId = req.session.userId!;
      const userRole = await storage.getUserRole(userId);
      
      if (!userRole || !["admin", "fc"].includes(userRole.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { status } = req.params;
      const requests = await storage.getSrpRequests(undefined, status);
      res.json(requests);
    } catch (error) {
      console.error("Error getting all requests:", error);
      res.status(500).json({ message: "Failed to get requests" });
    }
  });

  // Get single request
  app.get("/api/srp-requests/:id", isAuthenticated, async (req: Request, res) => {
    try {
      const userId = req.session.userId!;
      const { id } = req.params;
      
      const request = await storage.getSrpRequest(id);
      
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }

      // Check if user owns the request or is admin
      const userRole = await storage.getUserRole(userId);
      const isAdmin = userRole && ["admin", "fc"].includes(userRole.role);
      
      if (request.userId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }

      res.json(request);
    } catch (error) {
      console.error("Error getting request:", error);
      res.status(500).json({ message: "Failed to get request" });
    }
  });

  // Create SRP request
  app.post("/api/srp-requests", isAuthenticated, async (req: Request, res) => {
    try {
      const userId = req.session.userId!;
      
      const validated = insertSrpRequestSchema.parse(req.body);
      const request = await storage.createSrpRequest(userId, validated);
      res.status(201).json(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating SRP request:", error);
      res.status(500).json({ message: "Failed to create request" });
    }
  });

  // Review SRP request (approve/deny) - admin only
  app.patch("/api/srp-requests/:id/review", isAuthenticated, async (req: Request, res) => {
    try {
      const userId = req.session.userId!;
      const userRole = await storage.getUserRole(userId);
      
      if (!userRole || !["admin", "fc"].includes(userRole.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { id } = req.params;
      const { status, reviewerNote, payoutAmount } = req.body;

      if (!["approved", "denied", "processing"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const request = await storage.reviewSrpRequest(id, userId, status, reviewerNote, payoutAmount);
      
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }

      res.json(request);
    } catch (error) {
      console.error("Error reviewing request:", error);
      res.status(500).json({ message: "Failed to review request" });
    }
  });

  // Make first user admin (bootstrap endpoint)
  app.post("/api/admin/bootstrap", isAuthenticated, async (req: Request, res) => {
    try {
      const userId = req.session.userId!;
      
      // Check if any admin exists
      const existingRole = await storage.getUserRole(userId);
      
      if (existingRole?.role === "admin") {
        return res.json({ message: "Already admin", role: "admin" });
      }

      // Create or update to admin role
      let role;
      if (existingRole) {
        role = await storage.updateUserRole(userId, "admin");
      } else {
        role = await storage.createUserRole({ userId, role: "admin" });
      }

      res.json({ message: "Bootstrapped as admin", role: role?.role });
    } catch (error) {
      console.error("Error bootstrapping admin:", error);
      res.status(500).json({ message: "Failed to bootstrap admin" });
    }
  });

  return httpServer;
}
