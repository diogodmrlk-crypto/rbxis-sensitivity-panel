import { randomBytes } from "node:crypto";

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
  onlineAt?: number;
  history?: Array<Record<string, any>>;
};

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://zrjfzxqkpjhsisbjvpbx.supabase.co").replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyjfzxqkpjhsisbjvpbxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTI1ODksImV4cCI6MjA4OTMyODU4OX0.rUCxbhnvzMf9FAJsmyog2joHfYB-AekA1VnwvRF9Nbc";

function headers(extra?: HeadersInit) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "content-type": "application/json", ...(extra ?? {}) };
}

async function request<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/keys${path}`, { ...init, headers: headers(init?.headers), cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase respondeu ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function fromRow(row: any): MockKey {
  return normalizeKey({
    id: String(row.id), key: row.key, username: row.username ?? undefined,
    used: row.used, device: row.device ?? "", expire: row.expire, type: row.type,
    createdAt: row.created_at, activatedAt: row.activated_at, expiresAt: row.expires_at,
    status: row.status, onlineAt: row.online_at, history: Array.isArray(row.history) ? row.history : [],
  });
}

function toRow(value: Partial<MockKey>) {
  const row: Record<string, unknown> = {};
  if (value.key !== undefined) row.key = value.key;
  if (value.username !== undefined) row.username = value.username;
  if (value.used !== undefined) row.used = value.used;
  if (value.device !== undefined) row.device = value.device;
  if (value.expire !== undefined) row.expire = value.expire;
  if (value.type !== undefined) row.type = value.type;
  if (value.createdAt !== undefined) row.created_at = value.createdAt;
  if (value.activatedAt !== undefined) row.activated_at = value.activatedAt;
  if (value.expiresAt !== undefined) row.expires_at = value.expiresAt;
  if (value.status !== undefined) row.status = value.status;
  if (value.onlineAt !== undefined) row.online_at = value.onlineAt;
  if (value.history !== undefined) row.history = value.history;
  return row;
}

export async function listMockKeys() {
  const rows = await request<any[]>("?select=*&order=created_at.desc");
  return rows.map(fromRow);
}

export async function getMockKey(id: string) {
  try {
    const rows = await request<any[]>(`?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
    return rows[0] ? fromRow(rows[0]) : undefined;
  } catch { return undefined; }
}

export async function findMockKey(username: string, accessKey: string) {
  const keys = await listMockKeys();
  return keys.find(key => (key.username ?? key.key) === username && key.key === accessKey);
}

export async function createMockKey(input: { username: string; planId: string; durationValue: number; durationUnit: "days" | "weeks" | "months" | "years" }) {
  const now = Math.floor(Date.now() / 1000);
  const days = input.durationUnit === "days" ? input.durationValue : input.durationUnit === "weeks" ? input.durationValue * 7 : input.durationUnit === "months" ? input.durationValue * 30 : input.durationValue * 365;
  const type = input.planId === "week" ? "weekly" : input.planId === "month" ? "monthly" : input.planId === "year" ? "yearly" : input.planId === "perm" ? "perm" : input.durationUnit;
  const value: MockKey = { key: `SENSI-${type}-${randomBytes(6).toString("hex").toUpperCase()}`, username: input.username, used: false, device: "", expire: days, type, createdAt: now, activatedAt: 0, expiresAt: now + days * 86400, status: "active", onlineAt: 0, history: [] };
  const rows = await request<any[]>("", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(toRow(value)) });
  return fromRow(rows[0]);
}

export async function updateMockKey(id: string, patch: Partial<MockKey>) {
  const rows = await request<any[]>(`?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(toRow(patch)) });
  if (!rows[0]) throw new Error("Licença não encontrada");
  return fromRow(rows[0]);
}

export async function deleteMockKey(id: string) {
  await request(`?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  return { success: true as const };
}

function normalizeKey(value: MockKey): MockKey {
  return { ...value, used: Boolean(value.used), device: value.device ?? "", expire: Number(value.expire ?? 0), createdAt: Number(value.createdAt ?? 0), activatedAt: Number(value.activatedAt ?? 0), expiresAt: Number(value.expiresAt ?? 0), onlineAt: Number(value.onlineAt ?? 0), history: Array.isArray(value.history) ? value.history : [] };
}

export function mockKeyId(value: MockKey) {
  const raw = value.id ?? value.key; let hash = 0;
  for (const char of raw) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return Math.max(1, hash);
}

export function mockKeyToLicense(value: MockKey) {
  const expiresAt = value.expiresAt ? new Date(value.expiresAt * 1000) : new Date("2099-12-31T23:59:59Z");
  const durationUnit = value.type === "weekly" ? "weeks" : value.type === "monthly" ? "months" : value.type === "yearly" ? "years" : "days";
  return { id: mockKeyId(value), userId: mockKeyId({ ...value, key: `${value.key}:user` }), username: value.username ?? value.key, accessKey: value.key, planId: value.type, durationValue: value.expire, durationUnit, expiresAt, status: value.status ?? (value.expiresAt && value.expiresAt <= Math.floor(Date.now() / 1000) ? "revoked" : "active"), deviceId: value.device || null, lastLoginAt: value.activatedAt ? new Date(value.activatedAt * 1000) : null, createdAt: new Date(value.createdAt * 1000), updatedAt: new Date(), history: value.history ?? [] } as any;
}
