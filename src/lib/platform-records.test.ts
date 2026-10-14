import { describe, expect, it } from "vitest";
import { percentageChange, readAllPlatformRecords } from "./platform-records";

describe("live platform records", () => {
  it("reads all 205 records even when the server caps each page at 50", async () => {
    const source = Array.from({ length: 205 }, (_, id) => ({ id, total_count: 205 }));
    const rows = await readAllPlatformRecords(async (offset) => source.slice(offset, offset + 50));
    expect(rows).toHaveLength(205);
    expect(rows[204]?.id).toBe(204);
  });
  it("does not turn a failed read into an empty result", async () => {
    await expect(readAllPlatformRecords(async () => { throw new Error("Unavailable"); })).rejects.toThrow("Unavailable");
  });
  it("does not invent a change percentage without a prior baseline", () => {
    expect(percentageChange(8, 0)).toBeUndefined();
    expect(percentageChange(8, undefined)).toBeUndefined();
    expect(percentageChange(8, 4)).toBe(100);
  });
});