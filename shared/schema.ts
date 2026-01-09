import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// Enums for SRP system
export const userRoleEnum = pgEnum("user_role", ["member", "fc", "admin"]);
export const srpStatusEnum = pgEnum("srp_status", ["pending", "approved", "denied", "processing"]);
export const operationTypeEnum = pgEnum("operation_type", ["solo", "fleet"]);
export const srpProcessTypeEnum = pgEnum("srp_process_type", ["created", "approve", "deny", "pay", "updated"]);

// User roles table - maps SeAT user ID to role
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  seatUserId: integer("seat_user_id").notNull().unique(),
  role: userRoleEnum("role").notNull().default("member"),
}, (table) => [
  index("idx_user_roles_seat_user_id").on(table.seatUserId),
]);

// Fleet status enum
export const fleetStatusEnum = pgEnum("fleet_status", ["active", "completed", "cancelled"]);

// Fleets table - FC-created operations with UUID for SRP linking
export const fleets = pgTable("fleets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  operationName: text("operation_name").notNull(),
  description: text("description"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  location: text("location"),
  createdBySeatUserId: integer("created_by_seat_user_id").notNull(),
  fcCharacterName: text("fc_character_name").notNull(),
  status: fleetStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_fleets_created_by").on(table.createdBySeatUserId),
  index("idx_fleets_scheduled_at").on(table.scheduledAt),
  index("idx_fleets_status").on(table.status),
]);

// SRP Requests table
export const srpRequests = pgTable("srp_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  seatUserId: integer("seat_user_id").notNull(),
  killmailId: integer("killmail_id").notNull(),
  victimCharacterId: integer("victim_character_id"),
  victimCharacterName: text("victim_character_name"),
  shipTypeId: integer("ship_type_id").notNull(),
  iskAmount: integer("isk_amount").notNull(),
  operationType: operationTypeEnum("operation_type").notNull().default("fleet"),
  isSpecialRole: integer("is_special_role").notNull().default(0),
  lossDescription: text("loss_description"),
  fleetId: varchar("fleet_id"),
  payoutAmount: integer("payout_amount"),
}, (table) => [
  index("idx_srp_requests_seat_user_id").on(table.seatUserId),
  index("idx_srp_requests_victim_character").on(table.victimCharacterId),
  uniqueIndex("idx_srp_requests_killmail_id_unique").on(table.killmailId),
]);

// SRP Process Log table - tracks all state changes
export const srpProcessLog = pgTable("srp_process_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  srpRequestId: varchar("srp_request_id").notNull().references(() => srpRequests.id),
  processType: srpProcessTypeEnum("process_type").notNull(),
  occurredAt: timestamp("occurred_at").defaultNow(),
  byMainChar: text("by_main_char").notNull(),
  note: text("note"),
}, (table) => [
  index("idx_srp_process_log_request_id").on(table.srpRequestId),
  index("idx_srp_process_log_occurred_at").on(table.occurredAt),
]);

export const userRolesRelations = relations(userRoles, ({ }) => ({}));

export const fleetsRelations = relations(fleets, ({ }) => ({}));

export const srpRequestsRelations = relations(srpRequests, ({ many }) => ({
  processLogs: many(srpProcessLog),
}));

export const srpProcessLogRelations = relations(srpProcessLog, ({ one }) => ({
  srpRequest: one(srpRequests, {
    fields: [srpProcessLog.srpRequestId],
    references: [srpRequests.id],
  }),
}));

// Insert schemas
export const insertUserRoleSchema = createInsertSchema(userRoles).omit({ id: true });
export const insertFleetSchema = createInsertSchema(fleets).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  status: true,
});
export const insertSrpRequestSchema = createInsertSchema(srpRequests, {
  iskAmount: z.number().transform((val) => Math.round(val)),
}).omit({ 
  id: true, 
  seatUserId: true,
  payoutAmount: true,
});

export const insertSrpProcessLogSchema = createInsertSchema(srpProcessLog).omit({ 
  id: true, 
  occurredAt: true,
});

// Fleet creation form schema
export const fleetFormSchema = z.object({
  operationName: z.string().min(1, "작전명을 입력해주세요").max(100, "작전명은 100자 이내로 입력해주세요"),
  description: z.string().optional(),
  scheduledAt: z.date({ required_error: "작전 일시를 선택해주세요" }),
  location: z.string().optional(),
});

// Extended validation schema for SRP request form
export const srpRequestFormSchema = z.object({
  killmailUrl: z.string().url("올바른 킬메일 URL을 입력해주세요").refine(
    (url) => url.includes("zkillboard.com"),
    "URL은 zKillboard에서 가져와야 합니다"
  ),
  shipTypeId: z.number().min(1),
  iskAmount: z.number().min(1, "ISK 금액은 최소 1백만 이상이어야 합니다"),
  operationType: z.enum(["solo", "fleet"]),
  isSpecialRole: z.number().default(0),
  fleetId: z.string().optional(),
  lossDescription: z.string().optional(),
}).refine(
  (data) => {
    if (data.operationType === "fleet") {
      return data.fleetId && data.fleetId.length > 0;
    }
    return true;
  },
  { message: "플릿 운용시 플릿 UUID를 입력해주세요", path: ["fleetId"] }
);

// SRP calculation request schema
export const srpCalculateSchema = z.object({
  shipTypeId: z.number(),
  iskValue: z.number(),
  operationType: z.enum(["solo", "fleet"]),
  isSpecialRole: z.boolean().default(false),
  groupName: z.string().optional(),
});

// Ship data type (from EVE SDE catalog)
export type ShipData = {
  typeID: number;
  typeName: string;
  typeNameKo: string;
  groupID: number;
  groupName: string;
  groupNameKo: string;
  categoryID: number;
  categoryName: string;
  basePrice: number;
  volume?: number;
  marketGroupID?: number;
};

// Types
export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type Fleet = typeof fleets.$inferSelect;
export type InsertFleet = z.infer<typeof insertFleetSchema>;
export type FleetFormData = z.infer<typeof fleetFormSchema>;
export type SrpRequest = typeof srpRequests.$inferSelect;
export type InsertSrpRequest = z.infer<typeof insertSrpRequestSchema>;
export type SrpProcessLog = typeof srpProcessLog.$inferSelect;
export type InsertSrpProcessLog = z.infer<typeof insertSrpProcessLogSchema>;
export type SrpRequestFormData = z.infer<typeof srpRequestFormSchema>;
export type SrpCalculateRequest = z.infer<typeof srpCalculateSchema>;

export type SrpCalculateResponse = {
  estimatedPayout: number;
  breakdown: {
    baseValue: number;
    operationMultiplier: number;
    isSpecialRole: boolean;
    finalAmount: number;
    maxPayout: number;
    isSpecialShipClass?: boolean;
  };
};

// SRP status type derived from process log
// Flow: pending → approved/denied → paid (after approval)
export type SrpStatus = "pending" | "approved" | "denied" | "paid";

// Extended types for frontend display
export type SrpRequestWithDetails = SrpRequest & {
  status: SrpStatus;
  shipData?: ShipData;
  pilotName?: string;
  fleet?: Fleet;
  processLogs?: SrpProcessLog[];
};

export type DashboardStats = {
  pendingCount: number;
  approvedToday: number;
  totalPaidOut: number;
  averageProcessingHours: number;
};
