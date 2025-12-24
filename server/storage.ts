import { 
  userRoles, 
  srpRequests,
  fleets,
  type UserRole,
  type InsertUserRole,
  type Fleet,
  type InsertFleet,
  type SrpRequest,
  type InsertSrpRequest,
  type SrpRequestWithDetails,
  type DashboardStats
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, count, gte } from "drizzle-orm";
import { shipCatalogService } from "./services/shipCatalog";

export interface IStorage {
  // User roles (mapped by seatUserId)
  getUserRole(seatUserId: number): Promise<UserRole | undefined>;
  createUserRole(data: InsertUserRole): Promise<UserRole>;
  updateUserRole(seatUserId: number, role: string): Promise<UserRole | undefined>;

  // Fleets
  getFleets(createdBySeatUserId?: number): Promise<Fleet[]>;
  getFleet(id: string): Promise<Fleet | undefined>;
  getActiveFleets(): Promise<Fleet[]>;
  createFleet(seatUserId: number, fcName: string, data: InsertFleet): Promise<Fleet>;
  updateFleet(id: string, data: Partial<Fleet>): Promise<Fleet | undefined>;

  // SRP Requests
  getSrpRequests(seatUserId?: number, status?: string): Promise<SrpRequestWithDetails[]>;
  getSrpRequest(id: string): Promise<SrpRequestWithDetails | undefined>;
  getSrpRequestByKillmailId(killmailId: number): Promise<SrpRequest | undefined>;
  createSrpRequest(seatUserId: number, data: InsertSrpRequest): Promise<SrpRequest>;
  updateSrpRequest(id: string, data: Partial<SrpRequest>): Promise<SrpRequest | undefined>;
  reviewSrpRequest(id: string, reviewerName: string, status: string, note?: string, payout?: number): Promise<SrpRequest | undefined>;
  markSrpRequestPaid(id: string): Promise<SrpRequest | undefined>;

  // Stats
  getDashboardStats(seatUserId: number): Promise<DashboardStats>;
}

export class DatabaseStorage implements IStorage {
  // User roles
  async getUserRole(seatUserId: number): Promise<UserRole | undefined> {
    const [role] = await db.select().from(userRoles).where(eq(userRoles.seatUserId, seatUserId));
    return role || undefined;
  }

  async createUserRole(data: InsertUserRole): Promise<UserRole> {
    const [role] = await db.insert(userRoles).values(data).returning();
    return role;
  }

  async updateUserRole(seatUserId: number, role: string): Promise<UserRole | undefined> {
    const [updated] = await db
      .update(userRoles)
      .set({ role: role as any })
      .where(eq(userRoles.seatUserId, seatUserId))
      .returning();
    return updated || undefined;
  }

  // Fleets
  async getFleets(createdBySeatUserId?: number): Promise<Fleet[]> {
    if (createdBySeatUserId) {
      return await db.select().from(fleets)
        .where(eq(fleets.createdBySeatUserId, createdBySeatUserId))
        .orderBy(desc(fleets.scheduledAt));
    }
    return await db.select().from(fleets)
      .orderBy(desc(fleets.scheduledAt));
  }

  async getFleet(id: string): Promise<Fleet | undefined> {
    const [fleet] = await db.select().from(fleets).where(eq(fleets.id, id));
    return fleet || undefined;
  }

  async getActiveFleets(): Promise<Fleet[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    return await db.select().from(fleets)
      .where(and(
        eq(fleets.status, "active"),
        gte(fleets.scheduledAt, sevenDaysAgo)
      ))
      .orderBy(desc(fleets.scheduledAt));
  }

  async createFleet(seatUserId: number, fcName: string, data: InsertFleet): Promise<Fleet> {
    const [fleet] = await db.insert(fleets).values({
      ...data,
      createdBySeatUserId: seatUserId,
      fcCharacterName: fcName,
      status: "active",
    }).returning();
    return fleet;
  }

  async updateFleet(id: string, data: Partial<Fleet>): Promise<Fleet | undefined> {
    const [updated] = await db.update(fleets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(fleets.id, id))
      .returning();
    return updated || undefined;
  }

  // SRP Requests
  async getSrpRequests(seatUserId?: number, status?: string): Promise<SrpRequestWithDetails[]> {
    let conditions = [];
    if (seatUserId) {
      conditions.push(eq(srpRequests.seatUserId, seatUserId));
    }
    if (status && status !== "all") {
      conditions.push(eq(srpRequests.status, status as any));
    }

    const requests = await db
      .select()
      .from(srpRequests)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(srpRequests.createdAt));

    // Get fleet info for requests that have fleetId
    const fleetIds = Array.from(new Set(requests.filter(r => r.fleetId).map(r => r.fleetId!)));
    const fleetList = fleetIds.length > 0
      ? await db.select().from(fleets).where(sql`${fleets.id} = ANY(ARRAY[${sql.join(fleetIds.map(id => sql`${id}`), sql`, `)}])`)
      : [];
    const fleetMap = new Map(fleetList.map(f => [f.id, f]));

    return requests.map(r => {
      const shipData = shipCatalogService.getShipByTypeId(r.shipTypeId);
      const fleet = r.fleetId ? fleetMap.get(r.fleetId) : undefined;
      
      return {
        ...r,
        shipData: shipData,
        pilotName: r.victimCharacterName || "알 수 없는 파일럿",
        fleet,
      };
    });
  }

  async getSrpRequest(id: string): Promise<SrpRequestWithDetails | undefined> {
    const [request] = await db
      .select()
      .from(srpRequests)
      .where(eq(srpRequests.id, id));

    if (!request) return undefined;

    const shipData = shipCatalogService.getShipByTypeId(request.shipTypeId);
    
    // Use victimCharacterName as pilotName
    const pilotName = request.victimCharacterName || "알 수 없는 파일럿";

    // Get fleet info if linked
    let fleet = undefined;
    if (request.fleetId) {
      const [f] = await db.select().from(fleets).where(eq(fleets.id, request.fleetId));
      fleet = f || undefined;
    }

    return {
      ...request,
      shipData,
      pilotName,
      fleet,
    };
  }

  async getSrpRequestByKillmailId(killmailId: number): Promise<SrpRequest | undefined> {
    const [request] = await db
      .select()
      .from(srpRequests)
      .where(eq(srpRequests.killmailId, killmailId));
    return request || undefined;
  }

  async createSrpRequest(seatUserId: number, data: InsertSrpRequest): Promise<SrpRequest> {
    const [request] = await db
      .insert(srpRequests)
      .values({
        ...data,
        seatUserId,
        status: "pending",
      })
      .returning();
    return request;
  }

  async updateSrpRequest(id: string, data: Partial<SrpRequest>): Promise<SrpRequest | undefined> {
    const [updated] = await db
      .update(srpRequests)
      .set({ ...data })
      .where(eq(srpRequests.id, id))
      .returning();
    return updated || undefined;
  }

  async reviewSrpRequest(
    id: string, 
    reviewerName: string, 
    status: string, 
    note?: string, 
    payout?: number
  ): Promise<SrpRequest | undefined> {
    const [updated] = await db
      .update(srpRequests)
      .set({
        status: status as any,
        reviewerName,
        reviewerNote: note || null,
        payoutAmount: payout || null,
        reviewedAt: new Date(),
      })
      .where(eq(srpRequests.id, id))
      .returning();
    return updated || undefined;
  }

  async markSrpRequestPaid(id: string): Promise<SrpRequest | undefined> {
    const [updated] = await db
      .update(srpRequests)
      .set({
        paidAt: new Date(),
      })
      .where(eq(srpRequests.id, id))
      .returning();
    return updated || undefined;
  }

  // Stats (personal stats for a specific user)
  async getDashboardStats(seatUserId: number): Promise<DashboardStats> {
    // User's pending count
    const [{ count: pendingCount }] = await db
      .select({ count: count() })
      .from(srpRequests)
      .where(and(
        eq(srpRequests.seatUserId, seatUserId),
        eq(srpRequests.status, "pending")
      ));

    // User's approved today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [{ count: approvedToday }] = await db
      .select({ count: count() })
      .from(srpRequests)
      .where(and(
        eq(srpRequests.seatUserId, seatUserId),
        eq(srpRequests.status, "approved"),
        sql`${srpRequests.reviewedAt} >= ${today}`
      ));

    // User's total received payout
    const [paidResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(${srpRequests.payoutAmount}), 0)` })
      .from(srpRequests)
      .where(and(
        eq(srpRequests.seatUserId, seatUserId),
        eq(srpRequests.status, "approved")
      ));

    // User's average processing time (in hours)
    const [avgResult] = await db
      .select({ 
        avg: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${srpRequests.reviewedAt} - ${srpRequests.createdAt})) / 3600), 0)` 
      })
      .from(srpRequests)
      .where(and(
        eq(srpRequests.seatUserId, seatUserId),
        sql`${srpRequests.reviewedAt} IS NOT NULL`
      ));

    return {
      pendingCount: Number(pendingCount) || 0,
      approvedToday: Number(approvedToday) || 0,
      totalPaidOut: Number(paidResult?.total) || 0,
      averageProcessingHours: Math.round(Number(avgResult?.avg) || 0),
    };
  }
}

export const storage = new DatabaseStorage();
