import { db } from "../db";
import { userCharacters } from "@shared/models/auth";
import { eq } from "drizzle-orm";

const SEAT_API_BASE = "https://seat.nisuwaz.com";

interface SeatCharacterSheet {
  data: {
    character_id: number;
    name: string;
    corporation_id: number;
    corporation?: {
      name: string;
    };
    alliance_id?: number;
    alliance?: {
      name: string;
    };
    user_id?: number;
  };
}

interface SeatUserCharacters {
  data: Array<{
    character_id: number;
    name: string;
    corporation_id: number;
    corporation?: {
      name: string;
    };
    alliance_id?: number;
    alliance?: {
      name: string;
    };
  }>;
}

export class SeatApiService {
  private apiToken: string;

  constructor() {
    const token = process.env.SEAT_API_TOKEN;
    if (!token) {
      console.warn("SEAT_API_TOKEN not configured - character sync will be disabled");
    }
    this.apiToken = token || "";
  }

  private async fetchApi<T>(endpoint: string): Promise<T | null> {
    if (!this.apiToken) {
      console.warn("SeAT API token not configured");
      return null;
    }

    try {
      const response = await fetch(`${SEAT_API_BASE}${endpoint}`, {
        headers: {
          "Accept": "application/json",
          "X-Token": this.apiToken,
        },
      });

      if (!response.ok) {
        console.error(`SeAT API error: ${response.status} ${response.statusText}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error("SeAT API fetch error:", error);
      return null;
    }
  }

  async getCharacterSheet(characterId: number): Promise<SeatCharacterSheet["data"] | null> {
    const result = await this.fetchApi<SeatCharacterSheet>(`/api/v2/character/sheet/${characterId}`);
    return result?.data || null;
  }

  async getUserCharacters(seatUserId: number): Promise<SeatUserCharacters["data"] | null> {
    const result = await this.fetchApi<SeatUserCharacters>(`/api/v2/users/${seatUserId}/characters`);
    return result?.data || null;
  }

  async syncUserCharacters(userId: string, mainCharacterId: number): Promise<void> {
    if (!this.apiToken) {
      console.log("SeAT API token not configured - skipping character sync");
      return;
    }

    try {
      const characterSheet = await this.getCharacterSheet(mainCharacterId);
      if (!characterSheet || !characterSheet.user_id) {
        console.log(`Could not get SeAT user_id for character ${mainCharacterId}`);
        return;
      }

      const seatUserId = characterSheet.user_id;
      const characters = await this.getUserCharacters(seatUserId);
      
      if (!characters || characters.length === 0) {
        console.log(`No characters found for SeAT user ${seatUserId}`);
        return;
      }

      for (const char of characters) {
        const existingChar = await db.select()
          .from(userCharacters)
          .where(eq(userCharacters.characterId, char.character_id))
          .limit(1);

        if (existingChar.length > 0) {
          await db.update(userCharacters)
            .set({
              characterName: char.name,
              corporationId: char.corporation_id,
              corporationName: char.corporation?.name,
              allianceId: char.alliance_id,
              allianceName: char.alliance?.name,
              profileImageUrl: `https://images.evetech.net/characters/${char.character_id}/portrait?size=64`,
              isMainCharacter: char.character_id === mainCharacterId ? 1 : 0,
              lastSyncedAt: new Date(),
            })
            .where(eq(userCharacters.characterId, char.character_id));
        } else {
          await db.insert(userCharacters).values({
            userId,
            characterId: char.character_id,
            characterName: char.name,
            corporationId: char.corporation_id,
            corporationName: char.corporation?.name,
            allianceId: char.alliance_id,
            allianceName: char.alliance?.name,
            profileImageUrl: `https://images.evetech.net/characters/${char.character_id}/portrait?size=64`,
            isMainCharacter: char.character_id === mainCharacterId ? 1 : 0,
            lastSyncedAt: new Date(),
          });
        }
      }

      console.log(`Synced ${characters.length} characters for user ${userId}`);
    } catch (error) {
      console.error("Error syncing user characters:", error);
    }
  }

  async getSeatUserIdForCharacter(characterId: number): Promise<number | null> {
    const characterSheet = await this.getCharacterSheet(characterId);
    return characterSheet?.user_id || null;
  }
}

export const seatApiService = new SeatApiService();
