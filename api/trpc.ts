import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => process.env.RBXIS_SESSION_SECRET || "rbxis-session-secret-change-this-in-vercel";
const adminKey = () => "SENSIADMIN00";
const encode = (value: string) => Buffer.from(value).toString("base64url");
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

function tokenForAdmin() {
  const payload = encode(JSON.stringify({ role: "admin", username: "SENSIADMIN00", expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30 }));
  return `${payload}.${sign(payload)}`;
}

function readAdminSession(req: any) {
  const authorization = req.headers?.authorization;
  const cookie = req.headers?.cookie ?? "";
  const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : String(cookie).split(";").map((part) => part.trim()).find((part) => part.startsWith("rbxis_session="))?.slice("rbxis_session=".length);
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(expected), b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.role === "admin" && session.expiresAt > Date.now() ? session : null;
  } catch { return null; }
}

function respond(res: any, status: number, value: unknown) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(body);
}

export default async function trpc(req: any, res: any) {
  try {
    const url = new URL(req.url ?? "/api/trpc", `https://${req.headers?.host ?? "localhost"}`);
    const path = decodeURIComponent(url.searchParams.get("path") ?? url.pathname.replace(/^\/api\/trpc\/?/, ""));
    let input: any = req.body ?? {};
    if (typeof input === "string") input = JSON.parse(input);
    if (path === "auth.adminLogin") {
      const data = input?.json ?? input;
      if (String(data?.adminKey ?? "").trim() !== String(adminKey()).trim()) return respond(res, 401, { error: { json: { message: "Chave administrativa inválida" } } });
      const sessionToken = tokenForAdmin();
      res.setHeader("Set-Cookie", `rbxis_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      return respond(res, 200, { result: { data: { json: { success: true, username: "SENSIADMIN00", sessionToken } } } });
    }
    if (path === "auth.me") {
      return respond(res, 200, { result: { data: { json: readAdminSession(req) } } });
    }
    const { appRouter } = await import("../server/routers");
    const { createContext } = await import("../server/_core/context");
    const context = await createContext({ req, res } as any);
    let target: any = appRouter.createCaller(context);
    for (const segment of path.split(".").filter(Boolean)) target = target[segment];
    if (typeof target !== "function") return respond(res, 404, { error: { json: { message: `Procedure not found: ${path}` } } });
    return respond(res, 200, { result: { data: { json: await target(payload) } } });
  } catch (error: any) {
    return respond(res, 500, { error: { json: { message: error?.message ?? "Internal server error" } } });
  }
}
