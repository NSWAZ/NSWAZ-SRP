import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./eveAuth";
import { insertSrpRequestSchema, srpCalculateSchema, type SrpCalculateResponse } from "@shared/schema";
import { z } from "zod";
import { shipCatalogService } from "./services/shipCatalog";

// SRP Policy constants
const SRP_POLICY = {
  FLEET_MULTIPLIER: 1.0,
  SOLO_MULTIPLIER: 0.5,
  SPECIAL_ROLE_BONUS: 0.2,
  MAX_PAYOUT_MILLIONS: 5000,
};

interface ZKillmailData {
  killmail_id: number;
  zkb: {
    hash: string;
    totalValue: number;
  };
}

interface ESIKillmailVictim {
  ship_type_id: number;
  character_id?: number;
  corporation_id: number;
  alliance_id?: number;
}

interface ESIKillmailData {
  killmail_id: number;
  killmail_time: string;
  victim: ESIKillmailVictim;
}

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

  // Ship types from EVE SDE catalog (read-only)
  app.get("/api/ships", isAuthenticated, async (req, res) => {
    try {
      const ships = shipCatalogService.getAllShips();
      res.json(ships);
    } catch (error) {
      console.error("Error getting ships:", error);
      res.status(500).json({ message: "Failed to get ships" });
    }
  });

  // Get ship by typeID
  app.get("/api/ships/:typeId", isAuthenticated, async (req, res) => {
    try {
      const typeId = parseInt(req.params.typeId, 10);
      const ship = shipCatalogService.getShipByTypeId(typeId);
      
      if (!ship) {
        return res.status(404).json({ message: "Ship not found" });
      }
      
      res.json(ship);
    } catch (error) {
      console.error("Error getting ship:", error);
      res.status(500).json({ message: "Failed to get ship" });
    }
  });

  // Get all ship groups
  app.get("/api/ships/groups/all", isAuthenticated, async (req, res) => {
    try {
      const groups = shipCatalogService.getAllGroups();
      res.json(groups);
    } catch (error) {
      console.error("Error getting ship groups:", error);
      res.status(500).json({ message: "Failed to get ship groups" });
    }
  });

  // Get ships by group
  app.get("/api/ships/group/:groupName", isAuthenticated, async (req, res) => {
    try {
      const { groupName } = req.params;
      const ships = shipCatalogService.getShipsByGroup(decodeURIComponent(groupName));
      res.json(ships);
    } catch (error) {
      console.error("Error getting ships by group:", error);
      res.status(500).json({ message: "Failed to get ships" });
    }
  });

  // Search ships
  app.get("/api/ships/search/:query", isAuthenticated, async (req, res) => {
    try {
      const { query } = req.params;
      const ships = shipCatalogService.searchShips(decodeURIComponent(query));
      res.json(ships);
    } catch (error) {
      console.error("Error searching ships:", error);
      res.status(500).json({ message: "Failed to search ships" });
    }
  });

  // Ship catalog info
  app.get("/api/ships/catalog/info", isAuthenticated, async (req, res) => {
    try {
      res.json({
        version: shipCatalogService.getVersion(),
        totalShips: shipCatalogService.getTotalShips(),
        isLoaded: shipCatalogService.isLoaded(),
      });
    } catch (error) {
      console.error("Error getting catalog info:", error);
      res.status(500).json({ message: "Failed to get catalog info" });
    }
  });

  // Parse killmail URL and fetch data
  app.post("/api/killmail/parse", isAuthenticated, async (req: Request, res) => {
    try {
      const { url } = req.body;
      
      if (!url || typeof url !== "string") {
        return res.status(400).json({ message: "URL이 필요합니다" });
      }

      // Extract killmail ID from zkillboard URL
      const zkillMatch = url.match(/zkillboard\.com\/kill\/(\d+)/);
      if (!zkillMatch) {
        return res.status(400).json({ message: "올바른 zKillboard URL을 입력해주세요" });
      }

      const killmailId = zkillMatch[1];

      // Fetch from zKillboard API
      const zkillResponse = await fetch(`https://zkillboard.com/api/killID/${killmailId}/`);
      if (!zkillResponse.ok) {
        return res.status(400).json({ message: "킬메일 정보를 가져올 수 없습니다" });
      }

      const zkillData = await zkillResponse.json() as ZKillmailData[];
      if (!zkillData || zkillData.length === 0) {
        return res.status(404).json({ message: "킬메일을 찾을 수 없습니다" });
      }

      const killmail = zkillData[0];
      const hash = killmail.zkb.hash;
      const totalValue = killmail.zkb.totalValue;

      // Fetch detailed killmail from ESI
      const esiResponse = await fetch(
        `https://esi.evetech.net/latest/killmails/${killmailId}/${hash}/`
      );
      if (!esiResponse.ok) {
        return res.status(400).json({ message: "ESI에서 킬메일 정보를 가져올 수 없습니다" });
      }

      const esiData = await esiResponse.json() as ESIKillmailData;
      const shipTypeId = esiData.victim.ship_type_id;

      // Get ship info from our catalog
      const ship = shipCatalogService.getShipByTypeId(shipTypeId);

      res.json({
        killmailId: parseInt(killmailId),
        shipTypeId,
        shipTypeName: ship?.typeName || `Unknown (${shipTypeId})`,
        shipTypeNameKo: ship?.typeNameKo,
        groupName: ship?.groupName,
        iskValue: Math.round(totalValue / 1000000), // Convert to millions
        killmailTime: esiData.killmail_time,
        victimCharacterId: esiData.victim.character_id,
      });
    } catch (error) {
      console.error("Error parsing killmail:", error);
      res.status(500).json({ message: "킬메일 파싱에 실패했습니다" });
    }
  });

  // Calculate SRP payout
  app.post("/api/killmail/calculate", isAuthenticated, async (req: Request, res) => {
    try {
      const validated = srpCalculateSchema.parse(req.body);
      const { iskValue, operationType, isSpecialRole } = validated;

      const baseValue = iskValue;
      const operationMultiplier = operationType === "fleet" 
        ? SRP_POLICY.FLEET_MULTIPLIER 
        : SRP_POLICY.SOLO_MULTIPLIER;
      const specialRoleBonus = isSpecialRole ? SRP_POLICY.SPECIAL_ROLE_BONUS : 0;

      let finalAmount = Math.round(baseValue * operationMultiplier * (1 + specialRoleBonus));
      finalAmount = Math.min(finalAmount, SRP_POLICY.MAX_PAYOUT_MILLIONS);

      const response: SrpCalculateResponse = {
        estimatedPayout: finalAmount,
        breakdown: {
          baseValue,
          operationMultiplier,
          specialRoleBonus,
          finalAmount,
        },
      };

      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error calculating SRP:", error);
      res.status(500).json({ message: "SRP 계산에 실패했습니다" });
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
