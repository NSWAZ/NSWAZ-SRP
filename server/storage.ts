import { 
  userRoles, 
  srpRequests,
  srpProcessLog,
  fleets,
  type UserRole,
  type InsertUserRole,
  type Fleet,
  type InsertFleet,
  type SrpRequest,
  type InsertSrpRequest,
  type SrpProcessLog,
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
  createSrpRequest(seatUserId: number, mainCharName: string, data: InsertSrpRequest): Promise<SrpRequest>;
  updateSrpRequest(id: string, data: Partial<SrpRequest>): Promise<SrpRequest | undefined>;
  reviewSrpRequest(id: string, reviewerName: string, status: string, note?: string, payout?: number): Promise<SrpRequest | undefined>;
  markSrpRequestPaid(id: string, byMainChar: string): Promise<SrpRequest | undefined>;

  // SRP Process Log
  getSrpProcessLogs(srpRequestId: string): Promise<SrpProcessLog[]>;

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
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    if (requests.length === 0) return [];

    // Get all process logs for sorting
    const requestIds = requests.map(r => r.id);
    const allLogs = await db
      .select()
      .from(srpProcessLog)
      .where(sql`${srpProcessLog.srpRequestId} = ANY(ARRAY[${sql.join(requestIds.map(id => sql`${id}`), sql`, `)}])`)
      .orderBy(desc(srpProcessLog.occurredAt));

    // Group logs by request ID
    const logsMap = new Map<string, SrpProcessLog[]>();
    for (const log of allLogs) {
      if (!logsMap.has(log.srpRequestId)) {
        logsMap.set(log.srpRequestId, []);
      }
      logsMap.get(log.srpRequestId)!.push(log);
    }

    // Get created_at from first log for sorting
    const requestsWithCreatedAt = requests.map(r => {
      const logs = logsMap.get(r.id) || [];
      const createdLog = logs.find(l => l.processType === "created");
      return {
        ...r,
        processLogs: logs,
        createdAt: createdLog?.occurredAt || null,
      };
    });

    // Sort by created_at descending
    requestsWithCreatedAt.sort((a, b) => {
      if (!a.createdAt && !b.createdAt) return 0;
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    // Get fleet info for requests that have fleetId
    const fleetIds = Array.from(new Set(requests.filter(r => r.fleetId).map(r => r.fleetId!)));
    const fleetList = fleetIds.length > 0
      ? await db.select().from(fleets).where(sql`${fleets.id} = ANY(ARRAY[${sql.join(fleetIds.map(id => sql`${id}`), sql`, `)}])`)
      : [];
    const fleetMap = new Map(fleetList.map(f => [f.id, f]));

    return requestsWithCreatedAt.map(r => {
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

    // Get process logs
    const processLogs = await db
      .select()
      .from(srpProcessLog)
      .where(eq(srpProcessLog.srpRequestId, id))
      .orderBy(desc(srpProcessLog.occurredAt));

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
      processLogs,
    };
  }

  async getSrpRequestByKillmailId(killmailId: number): Promise<SrpRequest | undefined> {
    const [request] = await db
      .select()
      .from(srpRequests)
      .where(eq(srpRequests.killmailId, killmailId));
    return request || undefined;
  }

  async createSrpRequest(seatUserId: number, mainCharName: string, data: InsertSrpRequest): Promise<SrpRequest> {
    return await db.transaction(async (tx) => {
      const [request] = await tx
        .insert(srpRequests)
        .values({
          ...data,
          seatUserId,
          status: "pending",
        })
        .returning();

      await tx.insert(srpProcessLog).values({
        srpRequestId: request.id,
        processType: "created",
        byMainChar: mainCharName,
        note: null,
      });

      return request;
    });
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
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(srpRequests)
        .set({
          status: status as any,
          payoutAmount: payout || null,
        })
        .where(eq(srpRequests.id, id))
        .returning();

      if (!updated) return undefined;

      await tx.insert(srpProcessLog).values({
        srpRequestId: id,
        processType: status as any,
        byMainChar: reviewerName,
        note: note || null,
      });

      return updated;
    });
  }

  async markSrpRequestPaid(id: string, byMainChar: string): Promise<SrpRequest | undefined> {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(srpRequests)
        .set({
          status: "approved",
        })
        .where(eq(srpRequests.id, id))
        .returning();

      if (!updated) return undefined;

      await tx.insert(srpProcessLog).values({
        srpRequestId: id,
        processType: "paid",
        byMainChar,
        note: null,
      });

      return updated;
    });
  }

  // SRP Process Log
  async getSrpProcessLogs(srpRequestId: string): Promise<SrpProcessLog[]> {
    return await db
      .select()
      .from(srpProcessLog)
      .where(eq(srpProcessLog.srpRequestId, srpRequestId))
      .orderBy(desc(srpProcessLog.occurredAt));
  }

  // Stats (mix of personal and global stats)
  async getDashboardStats(seatUserId: number): Promise<DashboardStats> {
    // PERSONAL: User's pending count
    const [{ count: pendingCount }] = await db
      .select({ count: count() })
      .from(srpRequests)
      .where(and(
        eq(srpRequests.seatUserId, seatUserId),
        eq(srpRequests.status, "pending")
      ));

    // PERSONAL: User's total received payout (only actually paid ones - has 'paid' log)
    const paidRequestIds = db
      .select({ id: srpProcessLog.srpRequestId })
      .from(srpProcessLog)
      .where(eq(srpProcessLog.processType, "paid"));
    
    const [paidResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(${srpRequests.payoutAmount}), 0)` })
      .from(srpRequests)
      .where(and(
        eq(srpRequests.seatUserId, seatUserId),
        eq(srpRequests.status, "approved"),
        sql`${srpRequests.id} IN (${paidRequestIds})`
      ));

    // GLOBAL: Approved today (count 'approved' process logs from today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [{ count: approvedToday }] = await db
      .select({ count: count() })
      .from(srpProcessLog)
      .where(and(
        eq(srpProcessLog.processType, "approved"),
        gte(srpProcessLog.occurredAt, today)
      ));

    // GLOBAL: Average processing time (time between 'created' and 'approved'/'denied' logs)
    const avgResults = await db
      .select({ 
        avg: sql<number>`
          COALESCE(
            (SELECT AVG(EXTRACT(EPOCH FROM (review_log.occurred_at - created_log.occurred_at)) / 3600)
             FROM srp_process_log created_log
             JOIN srp_process_log review_log ON created_log.srp_request_id = review_log.srp_request_id
             WHERE created_log.process_type = 'created' 
               AND review_log.process_type IN ('approved', 'denied')),
            0
          )
        ` 
      })
      .from(srpProcessLog)
      .limit(1);
    const avgResult = avgResults[0];

    return {
      pendingCount: Number(pendingCount) || 0,
      approvedToday: Number(approvedToday) || 0,
      totalPaidOut: Number(paidResult?.total) || 0,
      averageProcessingHours: Math.round(Number(avgResult?.avg) || 0),
    };
  }
}

export const storage = new DatabaseStorage();
