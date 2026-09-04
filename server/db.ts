import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import {
  InsertProductLicense,
  InsertSensitivityHistory,
  InsertUser,
  ProductLicense,
  productLicenses,
  sensitivityHistory,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { createMockKey, deleteMockKey, findMockKey, getMockKey, listMockKeys, mockKeyToLicense, updateMockKey } from "./mockapi";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = values.role;
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function createProductLicense(input: {
  username: string;
  planId: string;
  durationValue: number;
  durationUnit: "days" | "weeks" | "months" | "years";
  expiresAt: Date;
}) {
  const created = await createMockKey(input);
  return mockKeyToLicense(created);
}

export async function getLicenseByCredentials(username: string, accessKey: string) {
  const key = await findMockKey(username, accessKey);
  if (!key) return undefined;
  const license = mockKeyToLicense(key);
  return { license, user: { id: license.userId } as any };
}

export async function getActiveLicenseSession(userId: number, licenseId: number) {
  const keys = await listMockKeys();
  const key = keys.find(item => mockKeyToLicense(item).id === licenseId);
  if (!key) return undefined;
  const license = mockKeyToLicense(key);
  if (license.status !== "active" || license.expiresAt.getTime() <= Date.now()) return undefined;
  return { license, user: { id: license.userId } as any };
}

export async function markLicenseLoggedIn(id: number, deviceId: string) {
  const keys = await listMockKeys();
  const key = keys.find(item => mockKeyToLicense(item).id === id);
  if (key?.id) await updateMockKey(key.id, { device: deviceId, used: true, activatedAt: key.activatedAt || Math.floor(Date.now() / 1000) });
}

export async function listProductLicenses() {
  return (await listMockKeys()).map(mockKeyToLicense).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getProductLicense(id: number) {
  const key = (await listMockKeys()).find(item => mockKeyToLicense(item).id === id);
  return key ? mockKeyToLicense(key) : undefined;
}

export async function updateProductLicense(id: number, values: Partial<Pick<ProductLicense, "status" | "planId" | "durationValue" | "durationUnit" | "expiresAt" | "deviceId" | "lastLoginAt">>) {
  const key = (await listMockKeys()).find(item => mockKeyToLicense(item).id === id);
  if (!key?.id) throw new Error("Licença não encontrada");
  const patch: Record<string, unknown> = {};
  if (values.status) patch.status = values.status;
  if (values.deviceId !== undefined) patch.device = values.deviceId ?? "";
  if (values.lastLoginAt) patch.activatedAt = Math.floor(new Date(values.lastLoginAt).getTime() / 1000);
  if (values.expiresAt) patch.expiresAt = Math.floor(new Date(values.expiresAt).getTime() / 1000);
  if (values.planId) patch.type = values.planId === "week" ? "weekly" : values.planId === "month" ? "monthly" : values.planId === "year" ? "yearly" : values.planId;
  if (values.durationValue) patch.expire = values.durationValue;
  const updated = await updateMockKey(key.id, patch);
  return mockKeyToLicense(updated);
}

export async function deleteProductLicense(id: number) {
  const key = (await listMockKeys()).find(item => mockKeyToLicense(item).id === id);
  if (!key?.id) throw new Error("Licença não encontrada");
  return deleteMockKey(key.id);
}

export async function listHistoryForUser(userId: number, favoritesOnly = false) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(sensitivityHistory.userId, userId)];
  if (favoritesOnly) conditions.push(eq(sensitivityHistory.favorite, 1));
  return db.select().from(sensitivityHistory).where(and(...conditions)).orderBy(desc(sensitivityHistory.createdAt));
}

export async function createHistory(values: InsertSensitivityHistory) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.insert(sensitivityHistory).values(values);
  const result = await db.select().from(sensitivityHistory).where(eq(sensitivityHistory.userId, values.userId)).orderBy(desc(sensitivityHistory.createdAt)).limit(1);
  return result[0];
}

export async function toggleHistoryFavorite(userId: number, historyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const current = await db.select().from(sensitivityHistory).where(and(eq(sensitivityHistory.id, historyId), eq(sensitivityHistory.userId, userId))).limit(1);
  if (!current[0]) return undefined;
  await db.update(sensitivityHistory).set({ favorite: current[0].favorite ? 0 : 1 }).where(eq(sensitivityHistory.id, historyId));
  const updated = await db.select().from(sensitivityHistory).where(eq(sensitivityHistory.id, historyId)).limit(1);
  return updated[0];
}

export async function getAdminStats() {
  const licenses = await listProductLicenses();
  return { total: licenses.length, active: licenses.filter(item => item.status === "active").length, revoked: licenses.filter(item => item.status === "revoked").length, blocked: licenses.filter(item => item.status === "blocked").length };
}
