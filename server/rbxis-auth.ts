import { createHmac, timingSafeEqual } from "node:crypto";
import { parse, serialize } from "cookie";
import type { Request, Response } from "express";
import { ENV } from "./_core/env";
import type { RbxisRole, RbxisSession } from "../shared/rbxis";

export const RBXIS_COOKIE_NAME = "rbxis_session";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const FALLBACK_SESSION_SECRET = "rbxis-session-secret-change-this-in-vercel";

function sessionSecret() {
  return process.env.RBXIS_SESSION_SECRET || ENV.cookieSecret || FALLBACK_SESSION_SECRET;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(input: Omit<RbxisSession, "expiresAt">) {
  const payload: RbxisSession = {
    ...input,
    expiresAt: Date.now() + SESSION_MAX_AGE_MS,
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${signature(encoded)}`;
}

export function readSessionToken(token: string | undefined): RbxisSession | null {
  if (!token || !sessionSecret()) return null;
  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) return null;

  try {
    const expectedSignature = signature(payload);
    const expectedBuffer = Buffer.from(expectedSignature);
    const providedBuffer = Buffer.from(providedSignature);
    if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
      return null;
    }

    const parsed = JSON.parse(decode(payload)) as RbxisSession;
    if (!parsed || !parsed.role || !parsed.expiresAt || parsed.expiresAt < Date.now()) return null;
    if (parsed.role !== "admin" && parsed.role !== "user") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readSessionFromRequest(req: Request) {
  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    const bearerSession = readSessionToken(authorization.slice("Bearer ".length).trim());
    if (bearerSession) return bearerSession;
  }
  const cookies = parse(req.headers.cookie ?? "");
  return readSessionToken(cookies[RBXIS_COOKIE_NAME]);
}

function isSecureRequest(req: Request) {
  if (ENV.isProduction || req.protocol === "https") return true;
  const forwarded = req.headers["x-forwarded-proto"];
  return typeof forwarded === "string" && forwarded.split(",")[0]?.trim() === "https";
}

export function setSessionCookie(req: Request, res: Response, session: Omit<RbxisSession, "expiresAt">) {
  const token = createSessionToken(session);
  res.setHeader("Set-Cookie", serialize(RBXIS_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
    path: "/",
  }));
  return token;
}

export function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(RBXIS_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
  });
}

export function getAdminAccessKey() {
  return process.env.RBXIS_ADMIN_KEY || "Ferraodev";
}

export function normalizeAdminKey(value: string) {
  return value.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
}

export function roleLabel(role: RbxisRole) {
  return role === "admin" ? "Administrador" : "Usuário";
}
