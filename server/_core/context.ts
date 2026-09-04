import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getActiveLicenseSession } from "../db";
import { readSessionFromRequest } from "../rbxis-auth";
import type { RbxisSession } from "../../shared/rbxis";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /** Kept nullable for scaffold compatibility; RBXIS uses rbxisSession. */
  user: User | null;
  rbxisSession?: RbxisSession | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  const tokenSession = readSessionFromRequest(opts.req);
  let rbxisSession: RbxisSession | null = null;

  if (tokenSession?.role === "admin") {
    rbxisSession = tokenSession;
  } else if (tokenSession?.role === "user" && tokenSession.userId && tokenSession.licenseId) {
    const active = await getActiveLicenseSession(tokenSession.userId, tokenSession.licenseId);
    if (active) {
      rbxisSession = {
        role: "user",
        userId: active.user.id,
        licenseId: active.license.id,
        username: active.license.username,
        expiresAt: active.license.expiresAt.getTime(),
      };
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user: null,
    rbxisSession,
  };
}
