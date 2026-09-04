import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { nodeHTTPRequestHandler } from "@trpc/server/adapters/node-http";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url?.split("?")[0] === "/api/health") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, service: "rbxis" }));
    return;
  }

  await nodeHTTPRequestHandler({
    req,
    res,
    path: "api/trpc",
    router: appRouter,
    createContext: ({ req: contextReq, res: contextRes }) =>
      createContext({ req: contextReq as any, res: contextRes as any }),
  });
}
