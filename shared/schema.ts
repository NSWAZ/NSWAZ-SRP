import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// Enums for SRP system
export const userRoleEnum = pgEnum("user_role", ["member", "fc", "admin"]);
export const srpStatusEnum = pgEnum("srp_status", ["pending", "approved", "denied", "processing"]);

// Ship types table (3NF - separate entity for ships)
export const shipTypes = pgTable("ship_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  category: text("category").notNull(), // frigate, destroyer, cruiser, battlecruiser, battleship, capital
  baseValue: integer("base_value").notNull().default(0), // ISK value
});

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
  shipTypeId: varchar("ship_type_id").notNull(),
  killmailUrl: text("killmail_url").notNull(),
  iskAmount: integer("isk_amount").notNull(), // in millions ISK
  lossDescription: text("loss_description"),
  fleetName: text("fleet_name"),
  fcName: text("fc_name"),
  status: srpStatusEnum("status").notNull().default("pending"),
  reviewerId: varchar("reviewer_id"),
  reviewerNote: text("reviewer_note"),
  payoutAmount: integer("payout_amount"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
}, (table) => [
  index("idx_srp_requests_user_id").on(table.userId),
  index("idx_srp_requests_status").on(table.status),
  index("idx_srp_requests_created_at").on(table.createdAt),
]);

// Relations
export const shipTypesRelations = relations(shipTypes, ({ many }) => ({
  srpRequests: many(srpRequests),
}));

export const srpRequestsRelations = relations(srpRequests, ({ one }) => ({
  shipType: one(shipTypes, {
    fields: [srpRequests.shipTypeId],
    references: [shipTypes.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ }) => ({}));

// Insert schemas
export const insertShipTypeSchema = createInsertSchema(shipTypes).omit({ id: true });
export const insertUserRoleSchema = createInsertSchema(userRoles).omit({ id: true });
export const insertSrpRequestSchema = createInsertSchema(srpRequests).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  reviewedAt: true,
  reviewerId: true,
  reviewerNote: true,
  payoutAmount: true,
  status: true,
});

// Extended validation schema for SRP request form
export const srpRequestFormSchema = insertSrpRequestSchema.extend({
  killmailUrl: z.string().url("Please enter a valid killmail URL").refine(
    (url) => url.includes("zkillboard.com") || url.includes("esi.evetech.net"),
    "URL must be from zKillboard or EVE ESI"
  ),
  iskAmount: z.number().min(1, "ISK amount must be at least 1 million"),
  lossDescription: z.string().min(10, "Please provide a description of at least 10 characters"),
  fleetName: z.string().min(1, "Fleet name is required"),
  fcName: z.string().min(1, "FC name is required"),
});

// Types
export type ShipType = typeof shipTypes.$inferSelect;
export type InsertShipType = z.infer<typeof insertShipTypeSchema>;
export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type SrpRequest = typeof srpRequests.$inferSelect;
export type InsertSrpRequest = z.infer<typeof insertSrpRequestSchema>;
export type SrpRequestFormData = z.infer<typeof srpRequestFormSchema>;

// Extended types for frontend display
export type SrpRequestWithDetails = SrpRequest & {
  shipType: ShipType;
  pilotName?: string;
  reviewerName?: string;
};

export type DashboardStats = {
  pendingCount: number;
  approvedToday: number;
  totalPaidOut: number;
  averageProcessingHours: number;
};
