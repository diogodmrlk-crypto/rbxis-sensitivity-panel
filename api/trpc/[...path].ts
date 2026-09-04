import { appRouter } from "../../server/routers";
import { createContext } from "../../server/_core/context";

function send(res: any, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  if (typeof res.status === "function") {
    res.status(status).json(payload);
    return;
  }
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(body);
}

function unwrap(input: unknown) {
  if (input && typeof input === "object" && "json" in input) return (input as { json: unknown }).json;
  return input;
}

async function readBody(req: any) {
  if (req.body !== undefined) return req.body;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

async function callProcedure(path: string, input: unknown, req: any, res: any) {
  const context = await createContext({
    req,
    res: {
      setHeader(name: string, value: string) {
        res.setHeader(name, value);
      },
      clearCookie(name: string) {
        res.setHeader("Set-Cookie", `${name}=; Max-Age=0; Path=/`);
      },
    } as any,
  });
  const segments = path.split(".").filter(Boolean);
  let target: any = appRouter.createCaller(context);
  for (const segment of segments) target = target[segment];
  if (typeof target !== "function") throw new Error(`Procedure not found: ${path}`);
  return target(unwrap(input));
}

export default async function trpcHandler(req: any, res: any) {
  try {
    const url = new URL(req.url ?? "/api/trpc", `https://${req.headers?.host ?? "localhost"}`);
    const path = decodeURIComponent(url.pathname.replace(/^\/api\/trpc\/?/, ""));
    const rawInput = req.method === "GET" ? url.searchParams.get("input") : await readBody(req);
    const input = typeof rawInput === "string" ? JSON.parse(rawInput) : rawInput;
    const result = await callProcedure(path, input, req, res);
    send(res, 200, { result: { data: { json: result } } });
  } catch (error: any) {
    const message = error?.message ?? "Internal server error";
    send(res, error?.data?.httpStatus ?? 500, {
      error: { json: { message, code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: error?.data?.httpStatus ?? 500, path: undefined } } },
    });
  }
}
