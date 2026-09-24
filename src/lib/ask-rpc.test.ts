import { describe, expect, it, vi } from "vitest";
import { sendAskJevRequest } from "./ask-rpc";

const payload = {
  pageContent: "Readable page text",
  ephemeralDocuments: [],
  referenceDocumentIds: [],
  question: "Is this a good fit?",
  choices: ["YES", "NO", "UNCLEAR"],
};

const success = {
  ok: true as const,
  result: {
    model: "jev-1.13.0",
    selected: "UNCLEAR",
    probabilities: [
      { label: "YES", probability: 0 },
      { label: "NO", probability: 0.02 },
      { label: "UNCLEAR", probability: 0.98 },
    ],
  },
  latencyMs: 120,
};

describe("sendAskJevRequest", () => {
  it("retries once when the service worker returns no response", async () => {
    const send = vi.fn(async (message: unknown) => {
      const type = (message as { type?: string }).type;
      if (type === "ASK_JEV_PING") return undefined;
      if (send.mock.calls.filter((call) => (call[0] as { type?: string }).type === "ASK_JEV_REQUEST").length < 2) {
        return undefined;
      }
      return success;
    });

    await expect(sendAskJevRequest(payload, send)).resolves.toEqual(success);
    const requests = send.mock.calls
      .map((call) => call[0] as { type?: string; requestId?: string })
      .filter((message) => message.type === "ASK_JEV_REQUEST");
    expect(requests).toHaveLength(2);
    expect(requests[0]?.requestId).toBe(requests[1]?.requestId);
  });

  it("surfaces a clear error after an empty response", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await expect(sendAskJevRequest(payload, send)).rejects.toThrow(
      "Ask Jev did not respond. Close the palette and try again.",
    );
  });
});
