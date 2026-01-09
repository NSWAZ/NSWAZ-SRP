import session from "express-session";
import type { Express, RequestHandler, Request, Response } from "express";
import connectPg from "connect-pg-simple";
import crypto from "crypto";
import { seatApiService, type CharacterSheetData } from "./services/seatApi";
import { storage } from "./storage";
import type { SessionUserData } from "@shared/models/auth";

const EVE_SSO_AUTH_URL = "https://login.eveonline.com/v2/oauth/authorize";
const EVE_SSO_TOKEN_URL = "https://login.eveonline.com/v2/oauth/token";

interface EveTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

interface EveCharacterInfo {
  CharacterID: number;
  CharacterName: string;
  ExpiresOn: string;
  Scopes: string;
  TokenType: string;
  CharacterOwnerHash: string;
  IntellectualProperty: string;
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUserData;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiry?: number;
    oauthState?: string;
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const isProduction = process.env.NODE_ENV === "production";
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

async function exchangeCodeForToken(code: string, redirectUri: string): Promise<EveTokenResponse> {
  const clientId = process.env.EVE_CLIENT_ID!;
  const clientSecret = process.env.EVE_CLIENT_SECRET!;
  
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  
  const response = await fetch(EVE_SSO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

async function refreshAccessToken(refreshToken: string): Promise<EveTokenResponse> {
  const clientId = process.env.EVE_CLIENT_ID!;
  const clientSecret = process.env.EVE_CLIENT_SECRET!;
  
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  
  const response = await fetch(EVE_SSO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error("Token refresh failed");
  }

  return response.json();
}

async function getCharacterInfo(accessToken: string): Promise<EveCharacterInfo> {
  const response = await fetch("https://esi.evetech.net/verify/", {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to verify character");
  }

  return response.json();
}

async function fetchUserDataFromSeat(characterId: number): Promise<SessionUserData | null> {
  try {
    console.log(`[auth] fetchUserDataFromSeat start`, { characterId });
    // 1) character sheet → user_id
    const sheet = await seatApiService.getCharacterSheet(characterId);
    if (!sheet) {
      console.error(`Could not load character sheet for ${characterId}`);
      return null;
    }
    console.log(`[auth] sheet`, {
      characterId: sheet.character_id,
      userId: sheet.user_id,
      corpId: sheet.corporation?.entity_id,
      corpName: sheet.corporation?.name,
      allianceId: sheet.alliance?.entity_id,
      allianceName: sheet.alliance?.name,
    });
    const seatUserId = sheet.user_id;
    if (!seatUserId) {
      console.error(`Could not find SeAT user for character ${characterId}`);
      return null;
    }

    // 2) user info → associated_character_ids, main_character_id
    const userInfo = await seatApiService.getUserById(seatUserId);
    if (!userInfo) {
      console.error(`SeAT user ${seatUserId} not found for character ${characterId}`);
      return null;
    }
    console.log(`[auth] userInfo`, {
      seatUserId,
      associatedCharacterIds: userInfo.associated_character_ids,
      mainCharacterId: userInfo.main_character_id,
    });
    const associatedCharacterIds = userInfo.associated_character_ids || [];
    const mainCharacterId = userInfo.main_character_id;

    // 3) main character sheet → name/corp/alliance
    // skip if main character is the same as the logged-in character
    let mainSheet = sheet;
    if (mainCharacterId !== characterId) {
      const fetchedMainSheet = await seatApiService.getCharacterSheet(mainCharacterId);
      if (!fetchedMainSheet) {
        console.error(`Could not load main character sheet for ${mainCharacterId}`);
        return null;
      }
      mainSheet = fetchedMainSheet;
    }
    console.log(`[auth] mainSheet`, {
      characterId: mainSheet.character_id,
      corpId: mainSheet.corporation?.entity_id,
      corpName: mainSheet.corporation?.name,
      allianceId: mainSheet.alliance?.entity_id,
      allianceName: mainSheet.alliance?.name,
    });
    const mainCharacterName = mainSheet.name;
    const mainCharacterCorporationId = mainSheet.corporation?.entity_id;
    const mainCharacterCorporationName = mainSheet.corporation?.name;
    const mainCharacterAllianceId = mainSheet.alliance?.entity_id;
    const mainCharacterAllianceName = mainSheet.alliance?.name;

    const profileImageUrl = `https://images.evetech.net/characters/${mainCharacterId}/portrait?size=128`;

    return {
      seatUserId,
      mainCharacterId,
      mainCharacterName,
      profileImageUrl,
      mainCharacterCorporationId,
      mainCharacterCorporationName,
      mainCharacterAllianceId,
      mainCharacterAllianceName,
      associatedCharacterIds,
    };
  } catch (error) {
    console.error("Error fetching user data from SeAT:", error);
    return null;
  }
}

interface ProcessLoginResult {
  success: boolean;
  error?: string;
  userData?: SessionUserData;
}

async function processLoginAfterCharacterFetch(userData: SessionUserData | null): Promise<ProcessLoginResult> {
  if (!userData) {
    return { success: false, error: "seat_user_not_found" };
  }

  // Check corp/alliance restrictions
  const allowedCorpIds = process.env.ALLOWED_CORP_IDS?.split(",").map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id)) || [];
  const allowedAllianceIds = process.env.ALLOWED_ALLIANCE_IDS?.split(",").map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id)) || [];
  
  const hasRestrictions = allowedCorpIds.length > 0 || allowedAllianceIds.length > 0;
  if (hasRestrictions) {
    const isAllowedCorp = allowedCorpIds.length > 0 && userData.mainCharacterCorporationId && allowedCorpIds.includes(userData.mainCharacterCorporationId);
    const isAllowedAlliance = allowedAllianceIds.length > 0 && userData.mainCharacterAllianceId && allowedAllianceIds.includes(userData.mainCharacterAllianceId);
    
    if (!isAllowedCorp && !isAllowedAlliance) {
      console.log(`Access denied for ${userData.mainCharacterName}: corp=${userData.mainCharacterCorporationId}, alliance=${userData.mainCharacterAllianceId}`);
      return { success: false, error: "access_denied" };
    }
  }

  return { success: true, userData };
}

function setupSessionAfterLogin(
  req: Request,
  userData: SessionUserData,
  tokens?: { access_token: string; refresh_token: string; expires_in: number }
): void {
  req.session.user = userData;
  if (tokens) {
    req.session.accessToken = tokens.access_token;
    req.session.refreshToken = tokens.refresh_token;
    req.session.tokenExpiry = Date.now() + tokens.expires_in * 1000;
  } else {
    // Dev bypass: set dummy token data with long expiry
    req.session.accessToken = "dev_bypass_token";
    req.session.refreshToken = "dev_bypass_refresh";
    req.session.tokenExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 1 week
  }
  console.log(`User logged in: seatUserId=${userData.seatUserId}, characterName=${userData.mainCharacterName}`);
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Login route - redirect to EVE SSO
  app.get("/api/login", (req: Request, res: Response) => {
    const clientId = process.env.EVE_CLIENT_ID;
    
    if (!clientId) {
      return res.status(500).json({ message: "EVE SSO not configured" });
    }

    const state = crypto.randomBytes(16).toString("hex");
    req.session.oauthState = state;

    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/callback`;
    
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state: state,
    });

    res.redirect(`${EVE_SSO_AUTH_URL}?${params.toString()}`);
  });

  // Callback route - handle EVE SSO response
  app.get("/api/auth/callback", async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;

      if (!code || typeof code !== "string") {
        return res.redirect("/?error=no_code");
      }

      if (state !== req.session.oauthState) {
        return res.redirect("/?error=state_mismatch");
      }

      delete req.session.oauthState;

      const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/callback`;
      const tokens = await exchangeCodeForToken(code, redirectUri);
      const characterInfo = await getCharacterInfo(tokens.access_token);

      // Fetch user data from SeAT
      const userData = await fetchUserDataFromSeat(characterInfo.CharacterID);
      
      // Process login (check restrictions, etc.)
      const result = await processLoginAfterCharacterFetch(userData);
      
      if (!result.success || !result.userData) {
        return res.redirect(`/?error=${result.error}`);
      }

      // Setup session with tokens
      setupSessionAfterLogin(req, result.userData, tokens);

      res.redirect("/");
    } catch (error) {
      console.error("EVE SSO callback error:", error);
      res.redirect("/?error=auth_failed");
    }
  });

  // Development mode SSO bypass
  if (process.env.NODE_ENV === "development") {
    app.get("/api/auth/dev-login", async (req: Request, res: Response) => {
      try {
        const { characterId } = req.query;
        
        if (!characterId || typeof characterId !== "string") {
          return res.status(400).json({ message: "characterId query parameter required" });
        }

        const charId = parseInt(characterId, 10);
        if (isNaN(charId)) {
          return res.status(400).json({ message: "Invalid characterId" });
        }

        console.log(`[dev-login] Attempting dev login with characterId: ${charId}`);

        // Fetch user data from SeAT (same as regular SSO flow)
        const userData = await fetchUserDataFromSeat(charId);
        
        // Process login (check restrictions, etc.) - same logic as regular SSO
        const result = await processLoginAfterCharacterFetch(userData);
        
        if (!result.success || !result.userData) {
          return res.redirect(`/?error=${result.error}`);
        }

        // Setup session without real tokens (dev bypass)
        setupSessionAfterLogin(req, result.userData);

        console.log(`[dev-login] Dev login successful for ${result.userData.mainCharacterName}`);
        res.redirect("/");
      } catch (error) {
        console.error("Dev login error:", error);
        res.redirect("/?error=dev_auth_failed");
      }
    });
  }

  // Logout route
  app.get("/api/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
      }
      res.redirect("/");
    });
  });

}

export const isAuthenticated: RequestHandler = async (req: Request, res: Response, next) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Date.now();
  const tokenExpiry = req.session.tokenExpiry || 0;

  if (now < tokenExpiry) {
    return next();
  }

  const refreshToken = req.session.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }


  try {
    const tokens = await refreshAccessToken(refreshToken);
    
    req.session.accessToken = tokens.access_token;
    req.session.refreshToken = tokens.refresh_token;
    req.session.tokenExpiry = Date.now() + tokens.expires_in * 1000;

    return next();
  } catch (error) {
    console.error("Token refresh failed:", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        seatUserId: user.seatUserId,
        characterId: user.mainCharacterId,
        characterName: user.mainCharacterName,
        profileImageUrl: user.profileImageUrl,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
