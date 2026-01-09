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
  type SrpStatus,
  type DashboardStats
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, count, gte } from "drizzle-orm";
import { shipCatalogService } from "./services/shipCatalog";

// Status-changing process types (not including 'updated' event)
// Process types: created, approve, deny, pay
const STATUS_PROCESS_TYPES = ["created", "approve", "deny", "pay"];

// Map process type to status
const PROCESS_TO_STATUS: Record<string, SrpStatus> = {
  created: "pending",
  approve: "approved",
  deny: "denied",
  pay: "paid",
};

// Helper to derive status from process logs
// Flow: pending → approved/denied → paid
function deriveStatusFromLogs(logs: SrpProcessLog[]): SrpStatus {
  if (logs.length === 0) return "pending";
  
  // Find the latest status-changing log (ignore 'updated' events)
  for (const log of logs) {
    if (STATUS_PROCESS_TYPES.includes(log.processType)) {
      return PROCESS_TO_STATUS[log.processType] || "pending";
    }
  }
  return "pending";
}

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
  addProcessLog(srpRequestId: string, processType: string, byMainChar: string, note?: string, payout?: number): Promise<void>;

  // SRP Process Log
  getSrpProcessLogs(srpRequestId: string): Promise<SrpProcessLog[]>;

  // Stats
  getDashboardStats(seatUserId: number): Promise<DashboardStats>;

  // Payment management
  getApprovedRequestsGroupedBySeatUserId(): Promise<Array<{ seatUserId: number; totalPayout: number; requestCount: number; requestIds: string[] }>>;
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
  async getSrpRequests(seatUserId?: number, statusFilter?: string): Promise<SrpRequestWithDetails[]> {
    let conditions = [];
    if (seatUserId) {
      conditions.push(eq(srpRequests.seatUserId, seatUserId));
    }

    const requests = await db
      .select()
      .from(srpRequests)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    if (requests.length === 0) return [];

    // Get all process logs
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

    // Build requests with derived status
    const requestsWithStatus = requests.map(r => {
      const logs = logsMap.get(r.id) || [];
      const status = deriveStatusFromLogs(logs);
      const createdLog = logs.find(l => l.processType === "created");
      return {
        ...r,
        status,
        processLogs: logs,
        createdAt: createdLog?.occurredAt || null,
      };
    });

    // Filter by status if requested
    const filteredRequests = statusFilter && statusFilter !== "all"
      ? requestsWithStatus.filter(r => r.status === statusFilter)
      : requestsWithStatus;

    // Sort by created_at descending
    filteredRequests.sort((a, b) => {
      if (!a.createdAt && !b.createdAt) return 0;
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    // Get fleet info for requests that have fleetId
    const fleetIds = Array.from(new Set(filteredRequests.filter(r => r.fleetId).map(r => r.fleetId!)));
    const fleetList = fleetIds.length > 0
      ? await db.select().from(fleets).where(sql`${fleets.id} = ANY(ARRAY[${sql.join(fleetIds.map(id => sql`${id}`), sql`, `)}])`)
      : [];
    const fleetMap = new Map(fleetList.map(f => [f.id, f]));

    return filteredRequests.map(r => {
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

    // Derive status from logs
    const status = deriveStatusFromLogs(processLogs);

    // Get fleet info if linked
    let fleet = undefined;
    if (request.fleetId) {
      const [f] = await db.select().from(fleets).where(eq(fleets.id, request.fleetId));
      fleet = f || undefined;
    }

    return {
      ...request,
      status,
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
    // Insert request
    const [request] = await db
      .insert(srpRequests)
      .values({
        ...data,
        seatUserId,
      })
      .returning();

    // Insert 'created' process log
    await db.insert(srpProcessLog).values({
      srpRequestId: request.id,
      processType: "created",
      byMainChar: mainCharName,
      note: null,
    });

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

  async addProcessLog(
    srpRequestId: string,
    processType: string,
    byMainChar: string,
    note?: string,
    payout?: number
  ): Promise<void> {
    // Update payout amount if provided
    if (payout !== undefined) {
      await db
        .update(srpRequests)
        .set({ payoutAmount: payout })
        .where(eq(srpRequests.id, srpRequestId));
    }

    // Insert process log
    await db.insert(srpProcessLog).values({
      srpRequestId,
      processType: processType as any,
      byMainChar,
      note: note || null,
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
    // Get user's requests with their process logs to calculate pending count
    const userRequests = await db
      .select()
      .from(srpRequests)
      .where(eq(srpRequests.seatUserId, seatUserId));

    let pendingCount = 0;
    let totalPaidOut = 0;

    if (userRequests.length > 0) {
      const requestIds = userRequests.map(r => r.id);
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

      // Count pending and sum paid payouts
      for (const request of userRequests) {
        const logs = logsMap.get(request.id) || [];
        const status = deriveStatusFromLogs(logs);
        if (status === "pending") {
          pendingCount++;
        }
        // Sum payouts for paid requests
        if (status === "paid" && request.payoutAmount) {
          totalPaidOut += request.payoutAmount;
        }
      }
    }

    // GLOBAL: Approved today (count 'approved' process logs from today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [{ count: approvedToday }] = await db
      .select({ count: count() })
      .from(srpProcessLog)
      .where(and(
        eq(srpProcessLog.processType, "approve"),
        gte(srpProcessLog.occurredAt, today)
      ));

    // GLOBAL: Average processing time (time between 'created' and 'approve'/'deny' logs)
    const avgResults = await db
      .select({ 
        avg: sql<number>`
          COALESCE(
            (SELECT AVG(EXTRACT(EPOCH FROM (review_log.occurred_at - created_log.occurred_at)) / 3600)
             FROM srp_process_log created_log
             JOIN srp_process_log review_log ON created_log.srp_request_id = review_log.srp_request_id
             WHERE created_log.process_type = 'created' 
               AND review_log.process_type IN ('approve', 'deny')),
            0
          )
        ` 
      })
      .from(srpProcessLog)
      .limit(1);
    const avgResult = avgResults[0];

    return {
      pendingCount,
      approvedToday: Number(approvedToday) || 0,
      totalPaidOut,
      averageProcessingHours: Math.round(Number(avgResult?.avg) || 0),
    };
  }

  // Payment management - get approved requests grouped by seatUserId
  async getApprovedRequestsGroupedBySeatUserId(): Promise<Array<{ seatUserId: number; totalPayout: number; requestCount: number; requestIds: string[] }>> {
    // Get all requests with their process logs
    const allRequests = await db.select().from(srpRequests);
    const allLogs = await db.select().from(srpProcessLog).orderBy(desc(srpProcessLog.occurredAt));

    // Build logs map
    const logsMap = new Map<string, SrpProcessLog[]>();
    for (const log of allLogs) {
      if (!logsMap.has(log.srpRequestId)) {
        logsMap.set(log.srpRequestId, []);
      }
      logsMap.get(log.srpRequestId)!.push(log);
    }

    // Group approved requests by seatUserId
    const userPayouts = new Map<number, { totalPayout: number; requestCount: number; requestIds: string[] }>();

    for (const request of allRequests) {
      const logs = logsMap.get(request.id) || [];
      const status = deriveStatusFromLogs(logs);

      if (status === "approved" && request.payoutAmount) {
        const existing = userPayouts.get(request.seatUserId) || { totalPayout: 0, requestCount: 0, requestIds: [] };
        existing.totalPayout += request.payoutAmount;
        existing.requestCount += 1;
        existing.requestIds.push(request.id);
        userPayouts.set(request.seatUserId, existing);
      }
    }

    return Array.from(userPayouts.entries()).map(([seatUserId, data]) => ({
      seatUserId,
      ...data,
    }));
  }

  // Mark multiple requests as paid atomically
  async markRequestsAsPaid(requestIds: string[], byMainChar: string): Promise<void> {
    await db.transaction(async (tx) => {
      for (const requestId of requestIds) {
        await tx.insert(srpProcessLog).values({
          id: crypto.randomUUID(),
          srpRequestId: requestId,
          processType: "pay",
          occurredAt: new Date(),
          byMainChar,
          note: null,
        });
      }
    });
  }
}

export const storage = new DatabaseStorage();
