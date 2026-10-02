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

/** Coleção pública da MockAPI; sem credenciais adicionais. */
export const MOCKAPI_KEYS_URL = "https://69b9908ce69653ffe6a81689.mockapi.io/api/v1/keys";

async function request<T>(path = "?sortBy=createdAt&order=desc", init?: RequestInit): Promise<T> {
  const response = await fetch(`${MOCKAPI_KEYS_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`MockAPI respondeu ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function fromRow(row: any): MockKey {
  return normalizeKey({
    id: row.id == null ? undefined : String(row.id),
    key: String(row.key ?? ""),
    username: row.username ?? undefined,
    used: row.used,
    device: row.device ?? "",
    expire: row.expire,
    type: String(row.type ?? "daily"),
    createdAt: row.createdAt,
    activatedAt: row.activatedAt,
    expiresAt: row.expiresAt,
    status: row.status,
    onlineAt: row.onlineAt,
    history: row.history,
  });
}

function toRow(value: Partial<MockKey>) {
  const row: Record<string, unknown> = {};
  for (const field of ["id", "key", "username", "used", "device", "expire", "type", "createdAt", "activatedAt", "expiresAt", "status", "onlineAt", "history"] as const) {
    if (value[field] !== undefined) row[field] = value[field];
  }
  return row;
}

export async function listMockKeys() {
  const rows = await request<any[]>();
  return rows.map(fromRow);
}

export async function getMockKey(id: string) {
  try {
    return fromRow(await request<any>(`/${encodeURIComponent(id)}`));
  } catch {
    return undefined;
  }
}

export async function findMockKey(_username: string, accessKey: string) {
  const keys = await listMockKeys();
  return keys.find(value => value.key.trim() === accessKey.trim());
}

export async function createMockKey(input: { username: string; planId: string; durationValue: number; durationUnit: "days" | "weeks" | "months" | "years" }) {
  const now = Math.floor(Date.now() / 1000);
  const days = input.durationUnit === "days" ? input.durationValue : input.durationUnit === "weeks" ? input.durationValue * 7 : input.durationUnit === "months" ? input.durationValue * 30 : input.durationValue * 365;
  const type = input.planId === "week" ? "weekly" : input.planId === "month" ? "monthly" : input.planId === "year" ? "yearly" : input.planId === "perm" ? "perm" : input.planId;
  const value: MockKey = { key: `SENSI-${type}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`, username: input.username, used: false, device: "", expire: days, type, createdAt: now, activatedAt: 0, expiresAt: 0, status: "active", onlineAt: 0, history: [] };
  return fromRow(await request<any>("", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(toRow(value)) }));
}

export async function updateMockKey(id: string, patch: Partial<MockKey>) {
  return fromRow(await request<any>(`/${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(toRow(patch)) }));
}

export async function deleteMockKey(id: string) {
  await request(`/${encodeURIComponent(id)}`, { method: "DELETE" });
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
