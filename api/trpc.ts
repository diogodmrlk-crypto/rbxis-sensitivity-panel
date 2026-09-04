import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type MockKey = {
  id?: string; key: string; username?: string; used?: boolean; device?: string; expire?: number;
  type?: string; createdAt?: number; activatedAt?: number; expiresAt?: number;
  status?: "active" | "revoked" | "blocked";
  history?: Array<Record<string, any>>; onlineAt?: number;
};

const MOCK_API = "https://69b9908ce69653ffe6a81689.mockapi.io/api/v1/keys";
const ADMIN_KEY = "SENSIADMIN00";
const secret = () => process.env.RBXIS_SESSION_SECRET || "rbxis-session-secret-change-this-in-vercel";
const encode = (value: string) => Buffer.from(value).toString("base64url");
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

function tokenForAdmin() {
  const payload = encode(JSON.stringify({ role: "admin", username: ADMIN_KEY, expiresAt: Date.now() + 2_592_000_000 }));
  return `${payload}.${sign(payload)}`;
}

function tokenForUser(key: MockKey) {
  const expiresAt = key.expiresAt ? key.expiresAt * 1000 : Date.now() + 31_536_000_000;
  const payload = encode(JSON.stringify({ role: "user", accessKey: key.key, username: key.key, expiresAt }));
  return `${payload}.${sign(payload)}`;
}

function readSession(req: any) {
  const authorization = req.headers?.authorization;
  const cookie = req.headers?.cookie ?? "";
  const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : String(cookie).split(";").map((part) => part.trim()).find((part) => part.startsWith("rbxis_session="))?.slice(14);
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(expected), b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return (session.role === "admin" || session.role === "user") && session.expiresAt > Date.now() ? session : null;
  } catch { return null; }
}

function readAdminSession(req: any) {
  const session = readSession(req);
  return session?.role === "admin" ? session : null;
}

async function mockRequest<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`${MOCK_API}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  if (!response.ok) throw new Error(`MockAPI respondeu ${response.status}`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function normalize(value: MockKey): MockKey {
  return { ...value, used: Boolean(value.used), device: value.device ?? "", expire: Number(value.expire ?? 0), createdAt: Number(value.createdAt ?? 0), activatedAt: Number(value.activatedAt ?? 0), expiresAt: Number(value.expiresAt ?? 0) };
}
function numericId(value: MockKey) {
  const raw = value.id ?? value.key; let hash = 0;
  for (const char of raw) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return Math.max(1, hash);
}
function asLicense(value: MockKey) {
  const key = normalize(value);
  const expires = key.expiresAt ? new Date(key.expiresAt * 1000) : new Date(Date.now() + 86400000);
  const durationUnit = key.type === "weekly" ? "weeks" : key.type === "monthly" ? "months" : key.type === "yearly" ? "years" : "days";
  return { id: numericId(key), userId: numericId({ ...key, key: `${key.key}:user` }), username: key.username ?? key.key, accessKey: key.key, planId: key.type ?? "custom", durationValue: key.expire ?? 0, durationUnit, expiresAt: expires, status: key.status ?? (key.expiresAt && key.expiresAt <= Math.floor(Date.now() / 1000) ? "revoked" : "active"), deviceId: key.device || null, lastLoginAt: key.activatedAt ? new Date(key.activatedAt * 1000) : null, createdAt: new Date((key.createdAt ?? 0) * 1000), updatedAt: new Date() };
}
function bodyInput(input: any) {
  if (input && typeof input === "object" && input["0"] !== undefined) {
    return input["0"]?.json ?? input["0"] ?? {};
  }
  return input?.json ?? input ?? {};
}
function durationDays(value: number, unit: string) { return unit === "days" ? value : unit === "weeks" ? value * 7 : unit === "months" ? value * 30 : value * 365; }
function addDuration(start: Date, value: number, unit: string) { const d = new Date(start); if (unit === "days") d.setDate(d.getDate() + value); else if (unit === "weeks") d.setDate(d.getDate() + value * 7); else if (unit === "months") d.setMonth(d.getMonth() + value); else d.setFullYear(d.getFullYear() + value); return Math.floor(d.getTime() / 1000); }
function buildSensitivity(seed: string) {
  const digest = createHash("sha256").update(seed).digest();
  const n = (index: number) => digest[index] ?? 0;
  return { general: 88 + (n(0) % 13), redDot: 82 + (n(1) % 17), scope2x: 76 + (n(2) % 20), scope4x: 68 + (n(3) % 24), awm: 54 + (n(4) % 30) };
}
function currentUserKey(session: any, raw: MockKey[]) { return raw.find((item) => item.key === session?.accessKey); }

function respond(res: any, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  // httpBatchLink sends even a single mutation as a batch request. tRPC expects
  // an array response whenever ?batch=1 is present.
  res.end(JSON.stringify(res.__trpcBatch ? [value] : value));
}
function ok(res: any, value: unknown) { return respond(res, 200, { result: { data: { json: value } } }); }
function fail(res: any, status: number, message: string) { return respond(res, status, { error: { json: { message } } }); }

export default async function trpc(req: any, res: any) {
  try {
    const url = new URL(req.url ?? "/api/trpc", `https://${req.headers?.host ?? "localhost"}`);
    res.__trpcBatch = url.searchParams.get("batch") === "1";
    const path = decodeURIComponent(url.searchParams.get("path") ?? url.pathname.replace(/^\/api\/trpc\/?/, ""));
    let input: any = req.body ?? {};
    if (typeof input === "string") input = JSON.parse(input);
    const data = bodyInput(input);

    if (path === "auth.adminLogin") {
      if (String(data.adminKey ?? "").trim() !== ADMIN_KEY) return fail(res, 401, "Chave administrativa inválida");
      const sessionToken = tokenForAdmin();
      res.setHeader("Set-Cookie", `rbxis_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      return ok(res, { success: true, username: ADMIN_KEY, sessionToken });
    }
    if (path === "auth.login") {
      const accessKey = String(data.accessKey ?? "").trim();
      const deviceId = String(data.deviceId ?? "").trim().slice(0, 160);
      if (!accessKey || deviceId.length < 8) return fail(res, 400, "Informe uma key válida e permita a identificação do dispositivo");
      const keys = (await mockRequest<MockKey[]>()).map(normalize);
      const key = keys.find((item) => item.key === accessKey);
      if (!key) return fail(res, 401, "Key inválida");
      if (key.status === "blocked") return fail(res, 403, "Esta key foi bloqueada pelo administrador");
      if (key.status === "revoked") return fail(res, 403, "Esta key foi revogada");
      if (key.expiresAt && key.expiresAt <= Math.floor(Date.now() / 1000)) return fail(res, 403, "Esta key expirou");
      if (key.device && key.device !== deviceId) return fail(res, 403, "Esta key já está vinculada a outro dispositivo");
      const now = Math.floor(Date.now() / 1000);
      const updated = normalize(await mockRequest<MockKey>(`/${encodeURIComponent(key.id ?? key.key)}`, { method: "PUT", body: JSON.stringify({ device: deviceId, used: true, activatedAt: key.activatedAt || now, onlineAt: now }) }));
      const sessionToken = tokenForUser(updated);
      res.setHeader("Set-Cookie", `rbxis_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      return ok(res, { success: true, username: updated.key, expiresAt: updated.expiresAt ? new Date(updated.expiresAt * 1000) : null, sessionToken });
    }
    if (path === "auth.me") {
      const session = readSession(req);
      if (!session) return ok(res, null);
      if (session.role === "admin") return ok(res, { role: "admin", username: ADMIN_KEY, name: ADMIN_KEY, email: null });
      const key = (await mockRequest<MockKey[]>()).map(normalize).find((item) => item.key === session.accessKey);
      if (!key || key.status === "revoked" || key.status === "blocked" || (key.expiresAt && key.expiresAt <= Math.floor(Date.now() / 1000))) return ok(res, null);
      return ok(res, { role: "user", username: key.key, name: key.key, email: null, planId: key.type ?? "daily", expiresAt: key.expiresAt ? new Date(key.expiresAt * 1000) : new Date("2099-12-31T23:59:59Z"), deviceId: key.device || null });
    }
    if (path === "auth.logout") { res.setHeader("Set-Cookie", "rbxis_session=; Path=/; HttpOnly; Max-Age=0"); return ok(res, { success: true }); }
    if (path === "generator.generate" || path === "generator.history" || path === "generator.favorites" || path === "generator.toggleFavorite") {
      const session = readSession(req);
      if (!session || session.role !== "user") return fail(res, 403, "O gerador é exclusivo para usuários");
      const userKey = currentUserKey(session, (await mockRequest<MockKey[]>()).map(normalize));
      if (!userKey) return fail(res, 403, "A licença não está ativa");
      const history = Array.isArray(userKey.history) ? userKey.history : [];
      if (path === "generator.history" || path === "generator.favorites") return ok(res, history.filter((item) => path === "generator.history" || item.favorite));
      if (path === "generator.toggleFavorite") {
        const id = Number(data.historyId); const next = history.map((item) => item.id === id ? { ...item, favorite: !item.favorite } : item);
        await mockRequest<MockKey>(`/${encodeURIComponent(userKey.id ?? userKey.key)}`, { method: "PUT", body: JSON.stringify({ history: next }) });
        return ok(res, { success: true });
      }
      const values = buildSensitivity(`${userKey.key}:${data.operatingSystem}:${data.device}:${data.performance}`);
      const record = { id: Date.now(), operatingSystem: data.operatingSystem, device: data.device, performance: data.performance, ...values, favorite: false, createdAt: new Date().toISOString() };
      await mockRequest<MockKey>(`/${encodeURIComponent(userKey.id ?? userKey.key)}`, { method: "PUT", body: JSON.stringify({ history: [record, ...history].slice(0, 100), onlineAt: Math.floor(Date.now() / 1000) }) });
      return ok(res, { values, historyId: record.id });
    }
    if (!readAdminSession(req)) return fail(res, 401, "Sessão administrativa inválida");

    const raw = (await mockRequest<MockKey[]>()).map(normalize);
    if (path === "admin.licenses") return ok(res, raw.map(asLicense));
    if (path === "admin.stats") {
      const licenses = raw.map(asLicense); const active = licenses.filter((x) => x.status === "active");
      return ok(res, { totalLicenses: licenses.length, activeLicenses: active.length, revokedLicenses: licenses.filter((x) => x.status === "revoked").length, blockedLicenses: licenses.filter((x) => x.status === "blocked").length, boundDevices: licenses.filter((x) => Boolean(x.deviceId)).length });
    }
    const match = (id: number) => raw.find((value) => numericId(value) === id);
    if (path === "admin.createLicense") {
      const days = durationDays(Number(data.durationValue), String(data.durationUnit)); const now = Math.floor(Date.now() / 1000);
      const type = data.planId === "weekly" ? "weekly" : data.planId === "perm" ? "perm" : "daily";
      const permanent = type === "perm";
      const created = await mockRequest<MockKey>("", { method: "POST", body: JSON.stringify({ key: `SENSI-${type}-${randomBytes(6).toString("hex").toUpperCase()}`, used: false, device: "", expire: permanent ? 0 : type === "weekly" ? 7 : 1, type, createdAt: now, activatedAt: 0, expiresAt: permanent ? 0 : now + (type === "weekly" ? 7 : 1) * 86400, status: "active" }) });
      return ok(res, asLicense(created));
    }
    const id = Number(data.id); const current = match(id);
    if (!current) return fail(res, 404, "Licença não encontrada");
    if (path === "admin.deleteLicense") { await mockRequest(`/${encodeURIComponent(current.id ?? current.key)}`, { method: "DELETE" }); return ok(res, { success: true }); }
    const patch: any = {};
    if (path === "admin.revokeLicense") patch.status = "revoked";
    else if (path === "admin.blockLicense") patch.status = "blocked";
    else if (path === "admin.resetDevice") { patch.device = ""; patch.activatedAt = 0; }
    else if (path === "admin.extendLicense") patch.expiresAt = addDuration(new Date((current.expiresAt ?? 0) * 1000), Number(data.durationValue), String(data.durationUnit));
    else if (path === "admin.updateLicense") { if (data.status) patch.status = data.status; if (data.planId) patch.type = data.planId; if (data.durationValue && data.durationUnit) { patch.expire = durationDays(Number(data.durationValue), String(data.durationUnit)); patch.expiresAt = addDuration(new Date(), Number(data.durationValue), String(data.durationUnit)); } }
    else return fail(res, 404, `Procedure not found: ${path}`);
    return ok(res, asLicense(await mockRequest<MockKey>(`/${encodeURIComponent(current.id ?? current.key)}`, { method: "PUT", body: JSON.stringify(patch) })));
  } catch (error: any) { return fail(res, 500, error?.message ?? "Internal server error"); }
}

void createHash;
