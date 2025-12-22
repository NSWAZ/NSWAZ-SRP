import session from "express-session";
import type { Express, RequestHandler, Request, Response } from "express";
import connectPg from "connect-pg-simple";
import crypto from "crypto";
import { seatApiService } from "./services/seatApi";
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
    // Get SeAT user ID from character
    const seatUserId = await seatApiService.getSeatUserIdForCharacter(characterId);
    if (!seatUserId) {
      console.error(`Could not find SeAT user for character ${characterId}`);
      return null;
    }

    // Get associated character IDs
    const associatedCharacterIds = await seatApiService.getAssociatedCharacterIds(characterId);
    
    // Get character sheet for additional info
    const characterSheet = await seatApiService.getCharacterSheet(characterId);
    
    const profileImageUrl = `https://images.evetech.net/characters/${characterId}/portrait?size=128`;

    return {
      seatUserId,
      mainCharacterId: characterId,
      mainCharacterName: characterSheet?.name || `Character_${characterId}`,
      profileImageUrl,
      corporationId: characterSheet?.corporation_id,
      corporationName: undefined,
      allianceId: characterSheet?.alliance_id,
      allianceName: undefined,
      associatedCharacterIds,
    };
  } catch (error) {
    console.error("Error fetching user data from SeAT:", error);
    return null;
  }
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

      // Fetch user data from SeAT and store in session
      const userData = await fetchUserDataFromSeat(characterInfo.CharacterID);
      
      if (!userData) {
        return res.redirect("/?error=seat_user_not_found");
      }

      req.session.user = userData;
      req.session.accessToken = tokens.access_token;
      req.session.refreshToken = tokens.refresh_token;
      req.session.tokenExpiry = Date.now() + tokens.expires_in * 1000;

      console.log(`User logged in: seatUserId=${userData.seatUserId}, characterName=${userData.mainCharacterName}`);

      res.redirect("/");
    } catch (error) {
      console.error("EVE SSO callback error:", error);
      res.redirect("/?error=auth_failed");
    }
  });

  // Logout route
  app.get("/api/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
      }
      res.redirect("/");
    });
  });

  // Test login route - ONLY available in development mode
  app.get("/api/test-login", async (req: Request, res: Response) => {
    const isDevelopment = process.env.NODE_ENV !== "production";
    
    if (!isDevelopment) {
      return res.redirect("/?error=test_login_disabled");
    }

    try {
      // Supported test characters with their roles
      const testCharacters: Record<number, string> = {
        96386549: "member",
        94403590: "fc",
      };

      const characterIdParam = req.query.characterId as string;
      const testCharacterId = characterIdParam ? parseInt(characterIdParam, 10) : 96386549;
      
      if (!testCharacters[testCharacterId]) {
        return res.redirect("/?error=invalid_test_character");
      }
      
      const role = testCharacters[testCharacterId];
      
      // Fetch user data from SeAT
      const userData = await fetchUserDataFromSeat(testCharacterId);
      
      if (!userData) {
        return res.redirect("/?error=seat_user_not_found");
      }

      // Ensure role is set for test character
      const existingRole = await storage.getUserRole(userData.seatUserId);
      if (!existingRole) {
        await storage.createUserRole({ seatUserId: userData.seatUserId, role: role as "member" | "fc" | "admin" });
        console.log(`Created ${role} role for seatUserId ${userData.seatUserId}`);
      } else if (existingRole.role !== role) {
        await storage.updateUserRole(userData.seatUserId, role);
        console.log(`Updated role to ${role} for seatUserId ${userData.seatUserId}`);
      }

      req.session.user = userData;
      req.session.accessToken = `test_access_token_${Date.now()}`;
      req.session.refreshToken = `test_refresh_token_${Date.now()}`;
      req.session.tokenExpiry = Date.now() + 1200 * 1000;

      console.log(`Test login: seatUserId=${userData.seatUserId}, characterName=${userData.mainCharacterName}, role=${role}`);

      res.redirect("/");
    } catch (error) {
      console.error("Test login error:", error);
      res.redirect("/?error=test_login_failed");
    }
  });

  // Check if app is in development mode
  app.get("/api/dev-mode", (req: Request, res: Response) => {
    res.json({ isDevelopment: process.env.NODE_ENV !== "production" });
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

  // For test tokens, just extend expiry
  if (refreshToken.startsWith("test_")) {
    req.session.tokenExpiry = Date.now() + 1200 * 1000;
    return next();
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
