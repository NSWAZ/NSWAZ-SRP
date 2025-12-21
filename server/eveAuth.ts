import session from "express-session";
import type { Express, RequestHandler, Request, Response } from "express";
import connectPg from "connect-pg-simple";
import crypto from "crypto";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

const EVE_SSO_AUTH_URL = "https://login.eveonline.com/v2/oauth/authorize";
const EVE_SSO_TOKEN_URL = "https://login.eveonline.com/v2/oauth/token";
const EVE_SSO_REVOKE_URL = "https://login.eveonline.com/v2/oauth/revoke";
const EVE_VERIFY_URL = "https://esi.evetech.net/verify/";

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
    userId?: string;
    characterId?: number;
    characterName?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiry?: number;
    oauthState?: string;
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
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
      secure: true,
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
  const response = await fetch(EVE_VERIFY_URL, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to verify character");
  }

  return response.json();
}

async function upsertUser(characterInfo: EveCharacterInfo, tokens: EveTokenResponse): Promise<string> {
  const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);
  const profileImageUrl = `https://images.evetech.net/characters/${characterInfo.CharacterID}/portrait?size=128`;
  
  const existingUser = await db.select().from(users).where(eq(users.characterId, characterInfo.CharacterID)).limit(1);
  
  if (existingUser.length > 0) {
    await db.update(users)
      .set({
        characterName: characterInfo.CharacterName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokenExpiry,
        profileImageUrl: profileImageUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.characterId, characterInfo.CharacterID));
    return existingUser[0].id;
  } else {
    const [newUser] = await db.insert(users)
      .values({
        characterId: characterInfo.CharacterID,
        characterName: characterInfo.CharacterName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokenExpiry,
        profileImageUrl: profileImageUrl,
      })
      .returning();
    return newUser.id;
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

    const redirectUri = `${req.protocol}://${req.get("host")}/api/callback`;
    
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "publicData",
      state: state,
    });

    res.redirect(`${EVE_SSO_AUTH_URL}?${params.toString()}`);
  });

  // Callback route - handle EVE SSO response
  app.get("/api/callback", async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;

      if (!code || typeof code !== "string") {
        return res.redirect("/?error=no_code");
      }

      if (state !== req.session.oauthState) {
        return res.redirect("/?error=state_mismatch");
      }

      delete req.session.oauthState;

      const redirectUri = `${req.protocol}://${req.get("host")}/api/callback`;
      const tokens = await exchangeCodeForToken(code, redirectUri);
      const characterInfo = await getCharacterInfo(tokens.access_token);
      const userId = await upsertUser(characterInfo, tokens);

      req.session.userId = userId;
      req.session.characterId = characterInfo.CharacterID;
      req.session.characterName = characterInfo.CharacterName;
      req.session.accessToken = tokens.access_token;
      req.session.refreshToken = tokens.refresh_token;
      req.session.tokenExpiry = Date.now() + tokens.expires_in * 1000;

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
}

export const isAuthenticated: RequestHandler = async (req: Request, res: Response, next) => {
  if (!req.session.userId) {
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

    await db.update(users)
      .set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: new Date(req.session.tokenExpiry),
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.session.userId));

    return next();
  } catch (error) {
    console.error("Token refresh failed:", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      const [user] = await db.select().from(users).where(eq(users.id, userId!)).limit(1);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: user.id,
        characterId: user.characterId,
        characterName: user.characterName,
        profileImageUrl: user.profileImageUrl,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
