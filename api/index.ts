import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.get(["/api/health", "/health"], (_req: any, res: any) => {
  res.status(200).json({ ok: true, service: "rbxis" });
});
app.use(
  ["/api/trpc", "/trpc"],
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

export default function handler(req: any, res: any) {
  return app(req, res);
}
