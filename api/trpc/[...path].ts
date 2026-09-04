import type { IncomingMessage, ServerResponse } from "node:http";
import { nodeHTTPRequestHandler } from "@trpc/server/adapters/node-http";
import { appRouter } from "../../server/routers";
import { createContext } from "../../server/_core/context";

export default async function trpcHandler(req: IncomingMessage, res: ServerResponse) {
  await nodeHTTPRequestHandler({
    req,
    res,
    path: "api/trpc",
    router: appRouter,
    createContext: ({ req: contextReq, res: contextRes }) =>
      createContext({ req: contextReq as any, res: contextRes as any }),
  });
}
