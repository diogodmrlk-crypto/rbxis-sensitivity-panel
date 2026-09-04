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

function makeAccessKey() {
  return `rbxis-${nanoid(24)}`;
}

export async function createProductLicense(input: {
  username: string;
  planId: string;
  durationValue: number;
  durationUnit: "days" | "weeks" | "months" | "years";
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const duplicateUsername = await db.select({ id: productLicenses.id }).from(productLicenses).where(eq(productLicenses.username, input.username)).limit(1);
  if (duplicateUsername[0]) throw new Error("DUPLICATE_USERNAME");
  const openId = `rbxis_${nanoid(28)}`;
  await db.insert(users).values({ openId, name: input.username, loginMethod: "rbxis" });
  const createdUser = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  if (!createdUser[0]) throw new Error("Não foi possível criar o usuário");

  let accessKey = makeAccessKey();
  let existing = await db.select({ id: productLicenses.id }).from(productLicenses).where(eq(productLicenses.accessKey, accessKey)).limit(1);
  while (existing[0]) {
    accessKey = makeAccessKey();
    existing = await db.select({ id: productLicenses.id }).from(productLicenses).where(eq(productLicenses.accessKey, accessKey)).limit(1);
  }

  const values: InsertProductLicense = {
    userId: createdUser[0].id,
    username: input.username,
    accessKey,
    planId: input.planId,
    durationValue: input.durationValue,
    durationUnit: input.durationUnit,
    expiresAt: input.expiresAt,
    status: "active",
  };
  await db.insert(productLicenses).values(values);
  const created = await db.select().from(productLicenses).where(eq(productLicenses.accessKey, accessKey)).limit(1);
  return created[0];
}

export async function getLicenseByCredentials(username: string, accessKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ license: productLicenses, user: users })
    .from(productLicenses)
    .innerJoin(users, eq(productLicenses.userId, users.id))
    .where(and(eq(productLicenses.username, username), eq(productLicenses.accessKey, accessKey)))
    .limit(1);
  return result[0];
}

export async function getActiveLicenseSession(userId: number, licenseId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ license: productLicenses, user: users })
    .from(productLicenses)
    .innerJoin(users, eq(productLicenses.userId, users.id))
    .where(and(eq(productLicenses.id, licenseId), eq(productLicenses.userId, userId), eq(productLicenses.status, "active")))
    .limit(1);
  const row = result[0];
  if (!row || row.license.expiresAt.getTime() <= Date.now()) return undefined;
  return row;
}

export async function markLicenseLoggedIn(id: number, deviceId: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(productLicenses).set({ deviceId, lastLoginAt: new Date() }).where(eq(productLicenses.id, id));
}

export async function listProductLicenses() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(productLicenses).orderBy(desc(productLicenses.createdAt));
}

export async function getProductLicense(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(productLicenses).where(eq(productLicenses.id, id)).limit(1);
  return result[0];
}

export async function updateProductLicense(id: number, values: Partial<Pick<ProductLicense, "status" | "planId" | "durationValue" | "durationUnit" | "expiresAt" | "deviceId" | "lastLoginAt">>) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.update(productLicenses).set(values).where(eq(productLicenses.id, id));
  return getProductLicense(id);
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
  const db = await getDb();
  if (!db) return { total: 0, active: 0, revoked: 0, blocked: 0 };
  const result = await db
    .select({ total: sql<number>`count(*)`, active: sql<number>`sum(status = 'active')`, revoked: sql<number>`sum(status = 'revoked')`, blocked: sql<number>`sum(status = 'blocked')` })
    .from(productLicenses);
  const row = result[0] ?? { total: 0, active: 0, revoked: 0, blocked: 0 };
  return { total: Number(row.total), active: Number(row.active), revoked: Number(row.revoked), blocked: Number(row.blocked) };
}
