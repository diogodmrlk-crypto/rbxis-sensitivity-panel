import { describe, expect, it } from "vitest";
import { createSessionToken, getAdminAccessKey, readSessionFromRequest, readSessionToken } from "./rbxis-auth";

describe("RBXIS session auth", () => {
  it("round-trips a user session with its claims", () => {
    const token = createSessionToken({ role: "user", userId: 42, licenseId: 7, username: "player_pro" });
    const session = readSessionToken(token);

    expect(session?.role).toBe("user");
    expect(session?.userId).toBe(42);
    expect(session?.licenseId).toBe(7);
    expect(session?.username).toBe("player_pro");
    expect(session?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("rejects tampered and malformed tokens", () => {
    const token = createSessionToken({ role: "admin", username: "Ferraodev" });
    const [payload] = token.split(".");

    expect(readSessionToken(`${payload}.tampered`)).toBeNull();
    expect(readSessionToken("not-a-session")).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
  });

  it("keeps the fixed SENSI admin access key", () => {
    expect(getAdminAccessKey()).toBe("SENSIADMIN00");
  });

  it("accepts the signed session through an Authorization bearer header", () => {
    const token = createSessionToken({ role: "admin", username: "Ferraodev" });
    const session = readSessionFromRequest({ headers: { authorization: `Bearer ${token}` } } as never);
    expect(session?.role).toBe("admin");
  });
});
