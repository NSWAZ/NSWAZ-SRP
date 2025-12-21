import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// Enums for SRP system
export const userRoleEnum = pgEnum("user_role", ["member", "fc", "admin"]);
export const srpStatusEnum = pgEnum("srp_status", ["pending", "approved", "denied", "processing"]);
export const operationTypeEnum = pgEnum("operation_type", ["solo", "fleet"]);

// User roles table (3NF - separate entity for role assignments)
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  role: userRoleEnum("role").notNull().default("member"),
}, (table) => [
  index("idx_user_roles_user_id").on(table.userId),
]);

// SRP Requests table
export const srpRequests = pgTable("srp_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  shipTypeId: integer("ship_type_id").notNull(),
  shipTypeName: text("ship_type_name"),
  killmailUrl: text("killmail_url").notNull(),
  iskAmount: integer("isk_amount").notNull(),
  operationType: operationTypeEnum("operation_type").notNull().default("fleet"),
  isSpecialRole: integer("is_special_role").notNull().default(0),
  lossDescription: text("loss_description"),
  fleetName: text("fleet_name"),
  fcName: text("fc_name"),
  status: srpStatusEnum("status").notNull().default("pending"),
  reviewerId: varchar("reviewer_id"),
  reviewerNote: text("reviewer_note"),
  payoutAmount: integer("payout_amount"),
  estimatedPayout: integer("estimated_payout"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
}, (table) => [
  index("idx_srp_requests_user_id").on(table.userId),
  index("idx_srp_requests_status").on(table.status),
  index("idx_srp_requests_created_at").on(table.createdAt),
]);

export const userRolesRelations = relations(userRoles, ({ }) => ({}));

// Insert schemas
export const insertUserRoleSchema = createInsertSchema(userRoles).omit({ id: true });
export const insertSrpRequestSchema = createInsertSchema(srpRequests).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  reviewedAt: true,
  reviewerId: true,
  reviewerNote: true,
  payoutAmount: true,
  estimatedPayout: true,
  status: true,
});

// Extended validation schema for SRP request form
export const srpRequestFormSchema = z.object({
  killmailUrl: z.string().url("올바른 킬메일 URL을 입력해주세요").refine(
    (url) => url.includes("zkillboard.com"),
    "URL은 zKillboard에서 가져와야 합니다"
  ),
  shipTypeId: z.number().min(1),
  shipTypeName: z.string().optional(),
  iskAmount: z.number().min(1, "ISK 금액은 최소 1백만 이상이어야 합니다"),
  operationType: z.enum(["solo", "fleet"]),
  isSpecialRole: z.number().default(0),
  fleetName: z.string().optional(),
  fcName: z.string().optional(),
  lossDescription: z.string().min(10, "최소 10자 이상의 설명을 입력해주세요"),
}).refine(
  (data) => {
    if (data.operationType === "fleet") {
      return data.fleetName && data.fleetName.length > 0 && data.fcName && data.fcName.length > 0;
    }
    return true;
  },
  { message: "플릿 운용시 함대명과 FC 이름을 입력해주세요", path: ["fleetName"] }
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
export type SrpRequest = typeof srpRequests.$inferSelect;
export type InsertSrpRequest = z.infer<typeof insertSrpRequestSchema>;
export type SrpRequestFormData = z.infer<typeof srpRequestFormSchema>;
export type SrpCalculateRequest = z.infer<typeof srpCalculateSchema>;

export type SrpCalculateResponse = {
  estimatedPayout: number;
  breakdown: {
    baseValue: number;
    operationMultiplier: number;
    specialRoleBonus: number;
    finalAmount: number;
    maxPayout: number;
  };
};

// Extended types for frontend display
export type SrpRequestWithDetails = SrpRequest & {
  shipData?: ShipData;
  pilotName?: string;
  reviewerName?: string;
};

export type DashboardStats = {
  pendingCount: number;
  approvedToday: number;
  totalPaidOut: number;
  averageProcessingHours: number;
};
