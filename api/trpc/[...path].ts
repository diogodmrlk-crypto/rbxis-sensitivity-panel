import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../server/routers";
import { createContext } from "../../server/_core/context";

export default async function trpcHandler(req: any, res: any) {
  const protocol = req.headers?.["x-forwarded-proto"] ?? "https";
  const host = req.headers?.host ?? "localhost";
  const url = `${protocol}://${host}${req.url ?? "/api/trpc"}`;
  const method = String(req.method ?? "GET").toUpperCase();
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers ?? {})) {
    if (Array.isArray(value)) headers.set(key, value.join(", "));
    else if (value != null) headers.set(key, String(value));
  }

  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    if (req.body !== undefined) {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      body = Buffer.concat(chunks).toString("utf8");
    }
  }
  const request = new Request(url, { method, headers, body });
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: ({ req: contextReq, resHeaders: responseHeaders }) =>
      createContext({
        req: contextReq as any,
        res: {
          setHeader(name: string, value: string) {
            responseHeaders.set(name, value);
          },
          clearCookie(name: string, options: Record<string, unknown>) {
            responseHeaders.set("Set-Cookie", `${name}=; Max-Age=0; Path=${String(options.path ?? "/")}`);
          },
        } as any,
      }),
  });

  response.headers.forEach((value, key) => {
    if (typeof res.setHeader === "function") res.setHeader(key, value);
  });
  const responseBody = await response.text();
  if (typeof res.status === "function") res.status(response.status);
  else res.statusCode = response.status;
  if (typeof res.send === "function") res.send(responseBody);
  else res.end(responseBody);
}
