import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";

function send(res: any, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  if (typeof res.status === "function") return res.status(status).json(payload);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(body);
}

function unwrap(input: unknown) {
  return input && typeof input === "object" && "json" in input ? (input as any).json : input;
}

async function bodyOf(req: any) {
  if (req.body !== undefined) return req.body;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

export default async function trpc(req: any, res: any) {
  try {
    const url = new URL(req.url ?? "/api/trpc", `https://${req.headers?.host ?? "localhost"}`);
    const path = decodeURIComponent(url.searchParams.get("path") ?? url.pathname.replace(/^\/api\/trpc(?:\.ts)?\/?/, ""));
    const raw = req.method === "GET" ? url.searchParams.get("input") : await bodyOf(req);
    const input = typeof raw === "string" ? JSON.parse(raw) : raw;
    const context = await createContext({
      req,
      res: {
        setHeader(name: string, value: string) { res.setHeader(name, value); },
        clearCookie(name: string) { res.setHeader("Set-Cookie", `${name}=; Max-Age=0; Path=/`); },
      } as any,
    });
    let target: any = appRouter.createCaller(context);
    for (const segment of path.split(".").filter(Boolean)) target = target[segment];
    if (typeof target !== "function") throw new Error(`Procedure not found: ${path}`);
    const result = await target(unwrap(input));
    send(res, 200, { result: { data: { json: result } } });
  } catch (error: any) {
    send(res, error?.data?.httpStatus ?? 500, { error: { json: { message: error?.message ?? "Internal server error", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: error?.data?.httpStatus ?? 500 } } } });
  }
}
