import { describe, expect, it } from "vitest";
import { listMockKeys } from "./mockapi";

describe("MockAPI keys integration", () => {
  it("reads the configured keys collection", async () => {
    const keys = await listMockKeys();
    expect(Array.isArray(keys)).toBe(true);
  });
});
