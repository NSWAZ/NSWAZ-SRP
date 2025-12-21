import { 
  users, 
  userRoles, 
  shipTypes, 
  srpRequests,
  type User,
  type UserRole,
  type InsertUserRole,
  type ShipType,
  type InsertShipType,
  type SrpRequest,
  type InsertSrpRequest,
  type SrpRequestWithDetails,
  type DashboardStats
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, count } from "drizzle-orm";

export interface IStorage {
  // User roles
  getUserRole(userId: string): Promise<UserRole | undefined>;
  createUserRole(data: InsertUserRole): Promise<UserRole>;
  updateUserRole(userId: string, role: string): Promise<UserRole | undefined>;

  // Ship types
  getShipTypes(): Promise<ShipType[]>;
  getShipType(id: string): Promise<ShipType | undefined>;
  createShipType(data: InsertShipType): Promise<ShipType>;
  updateShipType(id: string, data: Partial<InsertShipType>): Promise<ShipType | undefined>;
  deleteShipType(id: string): Promise<boolean>;

  // SRP Requests
  getSrpRequests(userId?: string, status?: string): Promise<SrpRequestWithDetails[]>;
  getSrpRequest(id: string): Promise<SrpRequestWithDetails | undefined>;
  createSrpRequest(userId: string, data: InsertSrpRequest): Promise<SrpRequest>;
  updateSrpRequest(id: string, data: Partial<SrpRequest>): Promise<SrpRequest | undefined>;
  reviewSrpRequest(id: string, reviewerId: string, status: string, note?: string, payout?: number): Promise<SrpRequest | undefined>;

  // Stats
  getDashboardStats(): Promise<DashboardStats>;
}

export class DatabaseStorage implements IStorage {
  // User roles
  async getUserRole(userId: string): Promise<UserRole | undefined> {
    const [role] = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    return role || undefined;
  }

  async createUserRole(data: InsertUserRole): Promise<UserRole> {
    const [role] = await db.insert(userRoles).values(data).returning();
    return role;
  }

  async updateUserRole(userId: string, role: string): Promise<UserRole | undefined> {
    const [updated] = await db
      .update(userRoles)
      .set({ role: role as any })
      .where(eq(userRoles.userId, userId))
      .returning();
    return updated || undefined;
  }

  // Ship types
  async getShipTypes(): Promise<ShipType[]> {
    return db.select().from(shipTypes).orderBy(shipTypes.name);
  }

  async getShipType(id: string): Promise<ShipType | undefined> {
    const [ship] = await db.select().from(shipTypes).where(eq(shipTypes.id, id));
    return ship || undefined;
  }

  async createShipType(data: InsertShipType): Promise<ShipType> {
    const [ship] = await db.insert(shipTypes).values(data).returning();
    return ship;
  }

  async updateShipType(id: string, data: Partial<InsertShipType>): Promise<ShipType | undefined> {
    const [updated] = await db
      .update(shipTypes)
      .set(data)
      .where(eq(shipTypes.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteShipType(id: string): Promise<boolean> {
    const result = await db.delete(shipTypes).where(eq(shipTypes.id, id)).returning();
    return result.length > 0;
  }

  // SRP Requests
  async getSrpRequests(userId?: string, status?: string): Promise<SrpRequestWithDetails[]> {
    let conditions = [];
    if (userId) {
      conditions.push(eq(srpRequests.userId, userId));
    }
    if (status && status !== "all") {
      conditions.push(eq(srpRequests.status, status as any));
    }

    const requests = await db
      .select({
        id: srpRequests.id,
        userId: srpRequests.userId,
        shipTypeId: srpRequests.shipTypeId,
        killmailUrl: srpRequests.killmailUrl,
        iskAmount: srpRequests.iskAmount,
        lossDescription: srpRequests.lossDescription,
        fleetName: srpRequests.fleetName,
        fcName: srpRequests.fcName,
        status: srpRequests.status,
        reviewerId: srpRequests.reviewerId,
        reviewerNote: srpRequests.reviewerNote,
        payoutAmount: srpRequests.payoutAmount,
        createdAt: srpRequests.createdAt,
        updatedAt: srpRequests.updatedAt,
        reviewedAt: srpRequests.reviewedAt,
        shipType: shipTypes,
      })
      .from(srpRequests)
      .leftJoin(shipTypes, eq(srpRequests.shipTypeId, shipTypes.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(srpRequests.createdAt));

    // Get pilot names
    const userIds = [...new Set(requests.map(r => r.userId))];
    const pilotUsers = userIds.length > 0 
      ? await db.select().from(users).where(sql`${users.id} = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}`), sql`, `)}])`)
      : [];
    
    const userMap = new Map(pilotUsers.map(u => [u.id, u]));

    return requests.map(r => ({
      ...r,
      shipType: r.shipType || { id: "", name: "Unknown", category: "other", baseValue: 0 },
      pilotName: userMap.get(r.userId)?.firstName 
        ? `${userMap.get(r.userId)?.firstName} ${userMap.get(r.userId)?.lastName || ""}`.trim()
        : userMap.get(r.userId)?.email || "Unknown Pilot",
    }));
  }

  async getSrpRequest(id: string): Promise<SrpRequestWithDetails | undefined> {
    const [request] = await db
      .select({
        id: srpRequests.id,
        userId: srpRequests.userId,
        shipTypeId: srpRequests.shipTypeId,
        killmailUrl: srpRequests.killmailUrl,
        iskAmount: srpRequests.iskAmount,
        lossDescription: srpRequests.lossDescription,
        fleetName: srpRequests.fleetName,
        fcName: srpRequests.fcName,
        status: srpRequests.status,
        reviewerId: srpRequests.reviewerId,
        reviewerNote: srpRequests.reviewerNote,
        payoutAmount: srpRequests.payoutAmount,
        createdAt: srpRequests.createdAt,
        updatedAt: srpRequests.updatedAt,
        reviewedAt: srpRequests.reviewedAt,
        shipType: shipTypes,
      })
      .from(srpRequests)
      .leftJoin(shipTypes, eq(srpRequests.shipTypeId, shipTypes.id))
      .where(eq(srpRequests.id, id));

    if (!request) return undefined;

    // Get pilot name
    const [pilot] = await db.select().from(users).where(eq(users.id, request.userId));
    const pilotName = pilot?.firstName 
      ? `${pilot.firstName} ${pilot.lastName || ""}`.trim()
      : pilot?.email || "Unknown Pilot";

    return {
      ...request,
      shipType: request.shipType || { id: "", name: "Unknown", category: "other", baseValue: 0 },
      pilotName,
    };
  }

  async createSrpRequest(userId: string, data: InsertSrpRequest): Promise<SrpRequest> {
    const [request] = await db
      .insert(srpRequests)
      .values({
        ...data,
        userId,
        status: "pending",
      })
      .returning();
    return request;
  }

  async updateSrpRequest(id: string, data: Partial<SrpRequest>): Promise<SrpRequest | undefined> {
    const [updated] = await db
      .update(srpRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(srpRequests.id, id))
      .returning();
    return updated || undefined;
  }

  async reviewSrpRequest(
    id: string, 
    reviewerId: string, 
    status: string, 
    note?: string, 
    payout?: number
  ): Promise<SrpRequest | undefined> {
    const [updated] = await db
      .update(srpRequests)
      .set({
        status: status as any,
        reviewerId,
        reviewerNote: note || null,
        payoutAmount: payout || null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(srpRequests.id, id))
      .returning();
    return updated || undefined;
  }

  // Stats
  async getDashboardStats(): Promise<DashboardStats> {
    // Pending count
    const [{ count: pendingCount }] = await db
      .select({ count: count() })
      .from(srpRequests)
      .where(eq(srpRequests.status, "pending"));

    // Approved today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [{ count: approvedToday }] = await db
      .select({ count: count() })
      .from(srpRequests)
      .where(and(
        eq(srpRequests.status, "approved"),
        sql`${srpRequests.reviewedAt} >= ${today}`
      ));

    // Total paid out
    const [paidResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(${srpRequests.payoutAmount}), 0)` })
      .from(srpRequests)
      .where(eq(srpRequests.status, "approved"));

    // Average processing time (in hours)
    const [avgResult] = await db
      .select({ 
        avg: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${srpRequests.reviewedAt} - ${srpRequests.createdAt})) / 3600), 0)` 
      })
      .from(srpRequests)
      .where(sql`${srpRequests.reviewedAt} IS NOT NULL`);

    return {
      pendingCount: Number(pendingCount) || 0,
      approvedToday: Number(approvedToday) || 0,
      totalPaidOut: Number(paidResult?.total) || 0,
      averageProcessingHours: Math.round(Number(avgResult?.avg) || 0),
    };
  }
}

export const storage = new DatabaseStorage();
