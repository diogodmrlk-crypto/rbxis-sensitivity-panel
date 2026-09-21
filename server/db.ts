import { InsertProductLicense, InsertSensitivityHistory, InsertUser, ProductLicense } from "../drizzle/schema";
import { createMockKey, deleteMockKey, findMockKey, getMockKey, listMockKeys, mockKeyId, mockKeyToLicense, updateMockKey } from "./mockapi";

type HistoryRecord = {
  id: number;
  userId: number;
  licenseId: number;
  operatingSystem: "android" | "ios";
  device: string;
  performance: "low" | "medium" | "high";
  general: number;
  redDot: number;
  scope2x: number;
  scope4x: number;
  awm: number;
  favorite: boolean;
  createdAt: string;
};

export async function getDb() { return null; }
export async function upsertUser(_user: InsertUser): Promise<void> { return; }
export async function getUserByOpenId(_openId: string) { return undefined; }

export async function createProductLicense(input: { username: string; planId: string; durationValue: number; durationUnit: "days" | "weeks" | "months" | "years"; expiresAt: Date }) {
  return mockKeyToLicense(await createMockKey(input));
}

export async function getLicenseByCredentials(username: string, accessKey: string) {
  const key = await findMockKey(username, accessKey);
  if (!key) return undefined;
  const license = mockKeyToLicense(key);
  return { license, user: { id: license.userId } as any };
}

export async function getActiveLicenseSession(userId: number, licenseId: number) {
  const keys = await listMockKeys();
  const key = keys.find(item => mockKeyToLicense(item).id === licenseId && mockKeyToLicense(item).userId === userId);
  if (!key) return undefined;
  const license = mockKeyToLicense(key);
  if (license.status !== "active" || license.expiresAt.getTime() <= Date.now()) return undefined;
  return { license, user: { id: license.userId } as any };
}

export async function markLicenseLoggedIn(id: number, deviceId: string) {
  const key = (await listMockKeys()).find(item => mockKeyToLicense(item).id === id);
  if (key?.id) await updateMockKey(key.id, { device: deviceId, used: true, activatedAt: key.activatedAt || Math.floor(Date.now() / 1000), onlineAt: Math.floor(Date.now() / 1000) });
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
  if (values.deviceId !== undefined) { patch.device = values.deviceId ?? ""; if (values.deviceId === null) patch.used = false; }
  if (values.lastLoginAt) patch.activatedAt = Math.floor(new Date(values.lastLoginAt).getTime() / 1000);
  if (values.expiresAt) patch.expiresAt = Math.floor(new Date(values.expiresAt).getTime() / 1000);
  if (values.planId) patch.type = values.planId === "week" ? "weekly" : values.planId === "month" ? "monthly" : values.planId === "year" ? "yearly" : values.planId;
  if (values.durationValue) patch.expire = values.durationValue;
  return mockKeyToLicense(await updateMockKey(key.id, patch));
}

export async function deleteProductLicense(id: number) {
  const key = (await listMockKeys()).find(item => mockKeyToLicense(item).id === id);
  if (!key?.id) throw new Error("Licença não encontrada");
  return deleteMockKey(key.id);
}

async function keyForUser(userId: number) {
  return (await listMockKeys()).find(item => mockKeyToLicense(item).userId === userId);
}

export async function listHistoryForUser(userId: number, favoritesOnly = false) {
  const key = await keyForUser(userId);
  const history = (key?.history ?? []) as HistoryRecord[];
  return history.filter(item => !favoritesOnly || Boolean(item.favorite)).sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime());
}

export async function createHistory(values: InsertSensitivityHistory) {
  const key = await keyForUser(Number(values.userId));
  if (!key?.id) throw new Error("Licença não encontrada");
  const history = (key.history ?? []) as HistoryRecord[];
  const record: HistoryRecord = { ...values, id: Date.now(), favorite: Boolean(values.favorite), createdAt: new Date().toISOString() } as HistoryRecord;
  await updateMockKey(key.id, { history: [record, ...history].slice(0, 100) });
  return record;
}

export async function toggleHistoryFavorite(userId: number, historyId: number) {
  const key = await keyForUser(userId);
  if (!key?.id) return undefined;
  const history = (key.history ?? []) as HistoryRecord[];
  const updated = history.map(item => item.id === historyId ? { ...item, favorite: !Boolean(item.favorite) } : item);
  await updateMockKey(key.id, { history: updated });
  return updated.find(item => item.id === historyId);
}

export async function getAdminStats() {
  const licenses = await listProductLicenses();
  return { total: licenses.length, active: licenses.filter(item => item.status === "active").length, revoked: licenses.filter(item => item.status === "revoked").length, blocked: licenses.filter(item => item.status === "blocked").length };
}
