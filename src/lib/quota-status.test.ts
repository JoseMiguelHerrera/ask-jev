import { describe, expect, it } from "vitest";
import { formatReset, quotaRows } from "./quota-status";

const snapshot = {
  install: { remaining: 6, limit: 10 },
  burst: { remaining: 0, limit: 3, windowSeconds: 30, retryAfterSeconds: 12 },
  network: { remaining: 496, limit: 500 },
  global: { remaining: 9980, limit: 10000 },
  resetsAt: "2026-09-24T00:00:00.000Z",
};

describe("quotaRows", () => {
  it("prints only the counts the proxy sent", () => {
    expect(quotaRows(snapshot).map((row) => row.text)).toEqual([
      "6 of 10 left today",
      "0 of 3 left",
      "496 of 500 left today",
      "9980 of 10000 left today",
    ]);
    expect(quotaRows({ ...snapshot, network: { remaining: 1 } })).toHaveLength(3);
    expect(quotaRows({})).toEqual([]);
  });

  it("formats the server reset instant in UTC", () => {
    expect(formatReset(snapshot.resetsAt)).toBe("Resets 2026-09-24 00:00:00 UTC");
    expect(formatReset(undefined)).toBeUndefined();
  });
});
