import { describe, expect, it, vi } from "vitest";
import { loadInstallId } from "./install-id";

describe("loadInstallId", () => {
  it("keeps an existing id and creates one when storage is empty", async () => {
    const existing = {
      get: vi.fn().mockResolvedValue({ installId: "11111111-1111-4111-8111-111111111111" }),
      set: vi.fn(),
    };
    await expect(loadInstallId(existing)).resolves.toBe("11111111-1111-4111-8111-111111111111");
    expect(existing.set).not.toHaveBeenCalled();

    const empty = {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const created = await loadInstallId(empty);
    expect(created).toMatch(/^[0-9a-f-]{36}$/);
    expect(empty.set).toHaveBeenCalledWith({ installId: created });
  });
});
