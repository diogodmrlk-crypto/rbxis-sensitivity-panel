import { nanoid } from "nanoid";

export type MockKey = {
  id?: string;
  key: string;
  username?: string;
  used: boolean;
  device: string;
  expire: number;
  type: string;
  createdAt: number;
  activatedAt: number;
  expiresAt: number;
  status?: "active" | "revoked" | "blocked";
};

function endpoint() {
  const value = process.env.MOCKAPI_KEYS_URL?.trim();
  if (!value) throw new Error("MOCKAPI_KEYS_URL não configurada na Vercel");
  return value.replace(/\/$/, "");
}

async function request<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`${endpoint()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`MockAPI respondeu ${response.status}`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function listMockKeys() {
  const keys = await request<MockKey[]>();
  return keys.map(normalizeKey);
}

export async function getMockKey(id: string) {
  try { return normalizeKey(await request<MockKey>(`/${encodeURIComponent(id)}`)); } catch { return undefined; }
}

export async function findMockKey(username: string, accessKey: string) {
  const keys = await listMockKeys();
  return keys.find(key => (key.username ?? key.key) === username && key.key === accessKey);
}

export async function createMockKey(input: { username: string; planId: string; durationValue: number; durationUnit: "days" | "weeks" | "months" | "years" }) {
  const now = Math.floor(Date.now() / 1000);
  const days = input.durationUnit === "days" ? input.durationValue : input.durationUnit === "weeks" ? input.durationValue * 7 : input.durationUnit === "months" ? input.durationValue * 30 : input.durationValue * 365;
  const type = input.planId === "week" ? "weekly" : input.planId === "month" ? "monthly" : input.planId === "year" ? "yearly" : input.planId === "quarter" ? "quarterly" : input.durationUnit;
  const value: MockKey = {
    key: `SENSI-${type}-${nanoid(10).toUpperCase()}`,
    username: input.username,
    used: false,
    device: "",
    expire: days,
    type,
    createdAt: now,
    activatedAt: 0,
    expiresAt: now + days * 86400,
    status: "active",
  };
  return normalizeKey(await request<MockKey>("", { method: "POST", body: JSON.stringify(value) }));
}

export async function updateMockKey(id: string, patch: Partial<MockKey>) {
  return normalizeKey(await request<MockKey>(`/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) }));
}

export async function deleteMockKey(id: string) {
  await request(`/${encodeURIComponent(id)}`, { method: "DELETE" });
  return { success: true as const };
}

function normalizeKey(value: MockKey): MockKey {
  const expiresAt = Number(value.expiresAt ?? 0);
  return { ...value, used: Boolean(value.used), device: value.device ?? "", expire: Number(value.expire ?? 0), createdAt: Number(value.createdAt ?? 0), activatedAt: Number(value.activatedAt ?? 0), expiresAt };
}

export function mockKeyId(value: MockKey) {
  const raw = value.id ?? value.key;
  let hash = 0;
  for (const char of raw) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return Math.max(1, hash);
}

export function mockKeyToLicense(value: MockKey) {
  const now = value.expiresAt ? new Date(value.expiresAt * 1000) : new Date(Date.now() + 86400000);
  const durationUnit = value.type === "weekly" ? "weeks" : value.type === "monthly" ? "months" : value.type === "yearly" ? "years" : "days";
  return {
    id: mockKeyId(value), userId: mockKeyId({ ...value, key: `${value.key}:user` }), username: value.username ?? value.key,
    accessKey: value.key, planId: value.type, durationValue: value.expire, durationUnit, expiresAt: now,
    status: value.status ?? (value.expiresAt && value.expiresAt <= Math.floor(Date.now() / 1000) ? "revoked" : "active"),
    deviceId: value.device || null, lastLoginAt: value.activatedAt ? new Date(value.activatedAt * 1000) : null,
    createdAt: new Date(value.createdAt * 1000), updatedAt: new Date(),
  } as any;
}
