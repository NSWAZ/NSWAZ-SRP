import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, integer } from "drizzle-orm/pg-core";

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

// Session user data type (stored in session, not in database)
export type SessionUserData = {
  seatUserId: number;
  mainCharacterId: number;
  mainCharacterName: string;
  profileImageUrl: string;
  mainCharacterCorporationId?: number;
  mainCharacterCorporationName?: string;
  mainCharacterAllianceId?: number;
  mainCharacterAllianceName?: string;
  associatedCharacterIds: number[];
};
