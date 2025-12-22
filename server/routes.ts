import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./eveAuth";
import { insertSrpRequestSchema, srpCalculateSchema, fleetFormSchema, type SrpCalculateResponse } from "@shared/schema";
import { z } from "zod";
import { shipCatalogService } from "./services/shipCatalog";
import { srpLimitsService } from "./services/srpLimits";

// SRP Policy constants
const SRP_POLICY = {
  FLEET_MULTIPLIER: 0.5,
  SOLO_MULTIPLIER: 0.25,
  SPECIAL_ROLE_MULTIPLIER: 1.0,
  DEFAULT_MAX_PAYOUT: 5000000000,
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
  await setupAuth(app);
  registerAuthRoutes(app);

  // Get current user's role
  app.get("/api/user/role", isAuthenticated, async (req: Request, res) => {
    try {
      const user = req.session.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      let userRole = await storage.getUserRole(user.seatUserId);
      
      if (!userRole) {
        userRole = await storage.createUserRole({ seatUserId: user.seatUserId, role: "member" });
      }

      res.json({ role: userRole.role });
    } catch (error) {
      console.error("Error getting user role:", error);
      res.status(500).json({ message: "Failed to get user role" });
    }
  });

  // Get user's characters (from session)
  app.get("/api/user/characters", isAuthenticated, async (req: Request, res) => {
    try {
      const user = req.session.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Return characters from session data
      const characters = user.associatedCharacterIds.map(id => ({
        characterId: id,
        isMainCharacter: id === user.mainCharacterId,
      }));
      
      res.json(characters);
    } catch (error) {
      console.error("Error getting user characters:", error);
      res.status(500).json({ message: "Failed to get user characters" });
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

  // ============= FLEET MANAGEMENT =============

  // Get active fleets (for SRP form dropdown)
  app.get("/api/fleets/active", isAuthenticated, async (req: Request, res) => {
    try {
      const fleets = await storage.getActiveFleets();
      res.json(fleets);
    } catch (error) {
      console.error("Error getting active fleets:", error);
      res.status(500).json({ message: "플릿 목록을 가져올 수 없습니다" });
    }
  });

  // Get fleet by ID (validate and fetch)
  app.get("/api/fleets/:id", isAuthenticated, async (req: Request, res) => {
    try {
      const { id } = req.params;
      const fleet = await storage.getFleet(id);
      
      if (!fleet) {
        return res.status(404).json({ message: "플릿을 찾을 수 없습니다" });
      }
      
      res.json(fleet);
    } catch (error) {
      console.error("Error getting fleet:", error);
      res.status(500).json({ message: "플릿 정보를 가져올 수 없습니다" });
    }
  });

  // Get my fleets (for FC users)
  app.get("/api/fleets/my/list", isAuthenticated, async (req: Request, res) => {
    try {
      const user = req.session.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const fleets = await storage.getFleets(user.seatUserId);
      res.json(fleets);
    } catch (error) {
      console.error("Error getting my fleets:", error);
      res.status(500).json({ message: "플릿 목록을 가져올 수 없습니다" });
    }
  });

  // Create fleet (FC/Admin only)
  app.post("/api/fleets", isAuthenticated, async (req: Request, res) => {
    try {
      const user = req.session.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Check if user has FC or admin role
      const userRole = await storage.getUserRole(user.seatUserId);
      if (!userRole || !["fc", "admin"].includes(userRole.role)) {
        return res.status(403).json({ message: "플릿 생성은 FC 또는 관리자만 가능합니다" });
      }
      
      // Validate request body
      const parsed = fleetFormSchema.safeParse({
        ...req.body,
        scheduledAt: new Date(req.body.scheduledAt),
      });
      
      if (!parsed.success) {
        return res.status(400).json({ 
          message: "잘못된 요청 데이터입니다",
          errors: parsed.error.flatten().fieldErrors 
        });
      }
      
      const fcName = user.mainCharacterName;
      
      const fleet = await storage.createFleet(user.seatUserId, fcName, {
        operationName: parsed.data.operationName,
        description: parsed.data.description,
        scheduledAt: parsed.data.scheduledAt,
        location: parsed.data.location,
        createdBySeatUserId: user.seatUserId,
        fcCharacterName: fcName,
      });
      
      res.status(201).json(fleet);
    } catch (error) {
      console.error("Error creating fleet:", error);
      res.status(500).json({ message: "플릿 생성에 실패했습니다" });
    }
  });

  // Update fleet status (FC owner or Admin only)
  app.patch("/api/fleets/:id/status", isAuthenticated, async (req: Request, res) => {
    try {
      const user = req.session.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { id } = req.params;
      const { status } = req.body;
      
      if (!["active", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "잘못된 상태입니다" });
      }
      
      const fleet = await storage.getFleet(id);
      if (!fleet) {
        return res.status(404).json({ message: "플릿을 찾을 수 없습니다" });
      }
      
      // Check permission (owner or admin)
      const userRole = await storage.getUserRole(user.seatUserId);
      if (fleet.createdBySeatUserId !== user.seatUserId && userRole?.role !== "admin") {
        return res.status(403).json({ message: "권한이 없습니다" });
      }
      
      const updated = await storage.updateFleet(id, { status: status as any });
      res.json(updated);
    } catch (error) {
      console.error("Error updating fleet status:", error);
      res.status(500).json({ message: "플릿 상태 변경에 실패했습니다" });
    }
  });

  // ============= END FLEET MANAGEMENT =============

  // Parse killmail URL and fetch data
  app.post("/api/killmail/parse", isAuthenticated, async (req: Request, res) => {
    try {
      const { url } = req.body;
      
      if (!url || typeof url !== "string") {
        return res.status(400).json({ message: "URL이 필요합니다" });
      }

      const zkillMatch = url.match(/zkillboard\.com\/kill\/(\d+)/);
      if (!zkillMatch) {
        return res.status(400).json({ message: "올바른 zKillboard URL을 입력해주세요" });
      }

      const killmailId = zkillMatch[1];

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

      const esiResponse = await fetch(
        `https://esi.evetech.net/latest/killmails/${killmailId}/${hash}/`
      );
      if (!esiResponse.ok) {
        return res.status(400).json({ message: "ESI에서 킬메일 정보를 가져올 수 없습니다" });
      }

      const esiData = await esiResponse.json() as ESIKillmailData;
      const shipTypeId = esiData.victim.ship_type_id;
      const victimCharacterId = esiData.victim.character_id;

      // Check ownership using session data
      const user = req.session.user;
      const associatedCharacterIds = user?.associatedCharacterIds || [];
      let isOwnedCharacter = false;
      let victimCharacterName: string | undefined;

      if (victimCharacterId) {
        if (associatedCharacterIds.length > 0) {
          isOwnedCharacter = associatedCharacterIds.includes(victimCharacterId);
        } else {
          isOwnedCharacter = true;
        }
        
        try {
          const charResponse = await fetch(`https://esi.evetech.net/latest/characters/${victimCharacterId}/`);
          if (charResponse.ok) {
            const charData = await charResponse.json() as { name: string };
            victimCharacterName = charData.name;
          }
        } catch {
          // Ignore ESI errors
        }
      }

      const ship = shipCatalogService.getShipByTypeId(shipTypeId);

      res.json({
        killmailId: parseInt(killmailId),
        shipTypeId,
        shipTypeName: ship?.typeName || `Unknown (${shipTypeId})`,
        shipTypeNameKo: ship?.typeNameKo,
        groupName: ship?.groupName,
        iskValue: totalValue,
        killmailTime: esiData.killmail_time,
        victimCharacterId,
        victimCharacterName,
        isOwnedCharacter,
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
      const { iskValue, operationType, isSpecialRole, groupName } = validated;

      const baseValue = iskValue;
      const isSpecialShipClass = groupName ? srpLimitsService.isSpecialClass(groupName) : false;
      const effectiveSpecialRole = operationType === "fleet" && isSpecialRole;
      
      let operationMultiplier: number;
      
      if (effectiveSpecialRole) {
        operationMultiplier = SRP_POLICY.SPECIAL_ROLE_MULTIPLIER;
      } else if (operationType === "fleet") {
        operationMultiplier = SRP_POLICY.FLEET_MULTIPLIER;
      } else if (isSpecialShipClass) {
        operationMultiplier = SRP_POLICY.SPECIAL_ROLE_MULTIPLIER;
      } else {
        operationMultiplier = SRP_POLICY.SOLO_MULTIPLIER;
      }

      let calculatedAmount = baseValue * operationMultiplier;

      let maxPayout: number;
      if (operationType === "solo" && groupName) {
        const soloLimit = srpLimitsService.getSoloMaxPayout(groupName);
        maxPayout = soloLimit ?? SRP_POLICY.DEFAULT_MAX_PAYOUT;
      } else {
        maxPayout = SRP_POLICY.DEFAULT_MAX_PAYOUT;
      }

      const finalAmount = Math.min(calculatedAmount, maxPayout);

      const response: SrpCalculateResponse = {
        estimatedPayout: finalAmount,
        breakdown: {
          baseValue,
          operationMultiplier,
          isSpecialRole: effectiveSpecialRole,
          finalAmount,
          maxPayout,
          isSpecialShipClass,
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
      const user = req.session.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const requests = await storage.getSrpRequests(user.seatUserId);
      res.json(requests.slice(0, 5));
    } catch (error) {
      console.error("Error getting recent requests:", error);
      res.status(500).json({ message: "Failed to get requests" });
    }
  });

  // SRP Requests - user's own requests (all)
  app.get("/api/srp-requests/my", isAuthenticated, async (req: Request, res) => {
    try {
      const user = req.session.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const requests = await storage.getSrpRequests(user.seatUserId);
      res.json(requests);
    } catch (error) {
      console.error("Error getting requests:", error);
      res.status(500).json({ message: "Failed to get requests" });
    }
  });

  // SRP Requests - all requests (admin only)
  app.get("/api/srp-requests/all/:status?", isAuthenticated, async (req: Request, res) => {
    try {
      const user = req.session.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userRole = await storage.getUserRole(user.seatUserId);
      
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
      const user = req.session.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      
      const request = await storage.getSrpRequest(id);
      
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }

      const userRole = await storage.getUserRole(user.seatUserId);
      const isAdmin = userRole && ["admin", "fc"].includes(userRole.role);
      
      if (request.seatUserId !== user.seatUserId && !isAdmin) {
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
      const user = req.session.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const validated = insertSrpRequestSchema.parse(req.body);
      
      if (!validated.victimCharacterId) {
        return res.status(400).json({ 
          message: "킬메일에서 피해자 캐릭터 정보를 찾을 수 없습니다. 올바른 킬메일 URL을 사용해주세요." 
        });
      }
      
      const associatedCharacterIds = user.associatedCharacterIds || [];
      
      // Validate ownership: either from SeAT character list or fallback to main login character
      if (associatedCharacterIds.length > 0) {
        // Full validation using SeAT character list
        if (!associatedCharacterIds.includes(validated.victimCharacterId)) {
          return res.status(403).json({ 
            message: "이 킬메일은 본인 소유의 캐릭터가 아닙니다. 본인의 로스만 SRP 신청 가능합니다." 
          });
        }
      } else {
        // Fallback: only allow main login character if SeAT data unavailable
        if (validated.victimCharacterId !== user.mainCharacterId) {
          return res.status(403).json({ 
            message: "캐릭터 정보를 확인할 수 없습니다. 로그인한 캐릭터의 로스만 신청 가능합니다. 다시 로그인해주세요." 
          });
        }
        console.warn(`User seatUserId=${user.seatUserId} using mainCharacter fallback for SRP validation`);
      }
      
      if (validated.operationType === "fleet") {
        if (!validated.fleetId) {
          return res.status(400).json({ 
            message: "플릿 운용시 플릿 UUID를 입력해주세요." 
          });
        }
        
        const fleet = await storage.getFleet(validated.fleetId);
        if (!fleet) {
          return res.status(400).json({ 
            message: "유효하지 않은 플릿 UUID입니다. FC에게 올바른 UUID를 받으세요." 
          });
        }
        
        validated.fleetName = fleet.operationName;
        validated.fcName = fleet.fcCharacterName;
      }
      
      const request = await storage.createSrpRequest(user.seatUserId, validated);
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
      const user = req.session.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userRole = await storage.getUserRole(user.seatUserId);
      
      if (!userRole || !["admin", "fc"].includes(userRole.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { id } = req.params;
      const { status, reviewerNote, payoutAmount } = req.body;

      if (!["approved", "denied", "processing"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const request = await storage.reviewSrpRequest(id, user.seatUserId, status, reviewerNote, payoutAmount);
      
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
      const user = req.session.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const existingRole = await storage.getUserRole(user.seatUserId);
      
      if (existingRole?.role === "admin") {
        return res.json({ message: "Already admin", role: "admin" });
      }

      let role;
      if (existingRole) {
        role = await storage.updateUserRole(user.seatUserId, "admin");
      } else {
        role = await storage.createUserRole({ seatUserId: user.seatUserId, role: "admin" });
      }

      res.json({ message: "Bootstrapped as admin", role: role?.role });
    } catch (error) {
      console.error("Error bootstrapping admin:", error);
      res.status(500).json({ message: "Failed to bootstrap admin" });
    }
  });

  return httpServer;
}

export function createHttpServer(app: Express): Server {
  return createServer(app);
}
