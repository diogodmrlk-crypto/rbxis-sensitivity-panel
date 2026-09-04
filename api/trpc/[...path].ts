import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { incomingMessageToRequest } from "@trpc/server/adapters/node-http";
import { appRouter } from "../../server/routers";
import { createContext } from "../../server/_core/context";

export default async function trpcHandler(req: IncomingMessage, res: ServerResponse) {
  const request = incomingMessageToRequest(req, res, { maxBodySize: 2 * 1024 * 1024 });
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

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
}
