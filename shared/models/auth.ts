import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, bigint } from "drizzle-orm/pg-core";

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

// User storage table for EVE Online characters
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  characterId: bigint("character_id", { mode: "number" }).unique(),
  characterName: varchar("character_name"),
  corporationId: bigint("corporation_id", { mode: "number" }),
  allianceId: bigint("alliance_id", { mode: "number" }),
  accessToken: varchar("access_token"),
  refreshToken: varchar("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
