import { createSessionToken, getAdminAccessKey, normalizeAdminKey, readSessionFromRequest } from "../server/rbxis-auth";

function send(res: any, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  if (typeof res.status === "function") return res.status(status).json(payload);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(body);
}

function result(res: any, value: unknown) {
  send(res, 200, { result: { data: { json: value } } });
}

async function inputOf(req: any) {
  if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export default async function trpc(req: any, res: any) {
  try {
    const url = new URL(req.url ?? "/api/trpc", `https://${req.headers?.host ?? "localhost"}`);
    const path = decodeURIComponent(url.searchParams.get("path") ?? url.pathname.replace(/^\/api\/trpc\/?/, ""));
    const raw = req.method === "GET" ? url.searchParams.get("input") : await inputOf(req);
    const input = typeof raw === "string" ? JSON.parse(raw) : raw;
    const payload = input?.json ?? input ?? {};

    if (path === "auth.adminLogin") {
      if (normalizeAdminKey(String(payload.adminKey ?? "")) !== normalizeAdminKey(getAdminAccessKey())) {
        return send(res, 401, { error: { json: { message: "Chave administrativa inválida", code: -32001, data: { code: "UNAUTHORIZED", httpStatus: 401 } } } });
      }
      const sessionToken = createSessionToken({ role: "admin", username: "Ferraodev" });
      res.setHeader?.("Set-Cookie", `rbxis_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      return result(res, { success: true, username: "Ferraodev", sessionToken });
    }

    if (path === "auth.me") {
      const session = readSessionFromRequest(req);
      return result(res, session);
    }

    const { appRouter } = await import("../server/routers");
    const { createContext } = await import("../server/_core/context");
    const context = await createContext({ req, res } as any);
    let target: any = appRouter.createCaller(context);
    for (const segment of path.split(".").filter(Boolean)) target = target[segment];
    if (typeof target !== "function") throw new Error(`Procedure not found: ${path}`);
    return result(res, await target(payload));
  } catch (error: any) {
    return send(res, error?.data?.httpStatus ?? 500, { error: { json: { message: error?.message ?? "Internal server error", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: error?.data?.httpStatus ?? 500 } } } });
  }
}
