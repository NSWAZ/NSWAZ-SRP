import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, bigint, integer } from "drizzle-orm/pg-core";

// Session storage table for EVE SSO
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table for EVE Online characters (main login character)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  characterId: bigint("character_id", { mode: "number" }).unique(),
  characterName: varchar("character_name"),
  corporationId: bigint("corporation_id", { mode: "number" }),
  allianceId: bigint("alliance_id", { mode: "number" }),
  seatUserId: integer("seat_user_id"), // SeAT user ID for linking multiple characters
  accessToken: varchar("access_token"),
  refreshToken: varchar("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_users_seat_user_id").on(table.seatUserId),
]);

// User characters table - links multiple EVE characters to a single user
export const userCharacters = pgTable("user_characters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // References users.id
  characterId: bigint("character_id", { mode: "number" }).notNull(),
  characterName: varchar("character_name").notNull(),
  corporationId: bigint("corporation_id", { mode: "number" }),
  corporationName: varchar("corporation_name"),
  allianceId: bigint("alliance_id", { mode: "number" }),
  allianceName: varchar("alliance_name"),
  profileImageUrl: varchar("profile_image_url"),
  isMainCharacter: integer("is_main_character").notNull().default(0), // 1 = main, 0 = alt
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_user_characters_user_id").on(table.userId),
  index("idx_user_characters_character_id").on(table.characterId),
]);

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type UserCharacter = typeof userCharacters.$inferSelect;
export type InsertUserCharacter = typeof userCharacters.$inferInsert;
