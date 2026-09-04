import { createMockKey, deleteMockKey, getMockKey } from "../server/mockapi";

const created = await createMockKey({ username: `__smoke_${Date.now()}`, planId: "week", durationValue: 7, durationUnit: "days" });
if (!created.id || !created.key.startsWith("SENSI-weekly-")) throw new Error("MockAPI create smoke test failed");
const fetched = await getMockKey(created.id);
if (!fetched || fetched.key !== created.key) throw new Error("MockAPI read smoke test failed");
await deleteMockKey(created.id);
const removed = await getMockKey(created.id);
if (removed) throw new Error("MockAPI delete smoke test failed");
console.log("MockAPI CRUD smoke test passed");
