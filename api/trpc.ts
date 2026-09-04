import type { IncomingMessage, ServerResponse } from "node:http";
import { nodeHTTPRequestHandler } from "@trpc/server/adapters/node-http";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";

export default async function trpcHandler(req: IncomingMessage, res: ServerResponse) {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = decodeURIComponent(requestUrl.pathname.replace(/^\/api\/trpc\/?/, ""));
  await nodeHTTPRequestHandler({
    req,
    res,
    path,
    router: appRouter,
    createContext: ({ req: contextReq, res: contextRes }) =>
      createContext({ req: contextReq as any, res: contextRes as any }),
  });
}
