import { appRouter } from "../server/routers";

const caller = appRouter.createCaller({
  req: { headers: {}, protocol: "http" } as any,
  res: { setHeader() {}, clearCookie() {} } as any,
  user: null,
  rbxisSession: null,
});

const result = await caller.auth.adminLogin({ adminKey: "Ferraodev" });
if (!result.success || result.sessionToken.length < 20) throw new Error("Admin login smoke test failed");
console.log("Router import and admin login smoke test passed");
