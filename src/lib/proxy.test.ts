import { describe, expect, it, vi } from "vitest";
import { requestFreeJev, signProxyBody } from "./proxy";

const input = {
  context: { webpage: "Visible page text" },
  question: "Is this short?",
  choices: ["YES", "NO"],
};
const settings = {
  apiKey: "",
  endpoint: "https://api.typesafe.ai/v1/systemone",
  model: "jev-latest",
};
const secret = "signing-secret";

function choiceResponse(remaining = 99) {
  return new Response(
    JSON.stringify({
      model: "jev-1.13.0",
      remaining,
      answers: {
        judgment: {
          type: "choice",
          choice: "YES",
          probabilities: { YES: 0.7, NO: 0.3 },
        },
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("signProxyBody", () => {
  it("matches the proxy HMAC of timestamp and raw body", async () => {
    const raw = "{\"ok\":true}";
    const signature = await signProxyBody(secret, "1700000000000", raw);
    expect(signature).toBe("78c6b239e8a0dab20d4b68f96f5d77defce4ff8bebbbee9ce8c0da339ff97ab4");
  });
});

describe("requestFreeJev", () => {
  it("signs the free request and does not send an API key", async () => {
    const fetcher = vi.fn().mockResolvedValue(choiceResponse());
    const asked = await requestFreeJev(input, settings, {
      installId: "11111111-1111-4111-8111-111111111111",
      secret,
      proxyUrl: "https://proxy.example",
      fetcher,
      now: () => 1_700_000_000_000,
    });

    expect(asked.remaining).toBe(99);
    expect(asked.result.selected).toBe("YES");
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://proxy.example/api/ask");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-ask-jev-install")).toBe("11111111-1111-4111-8111-111111111111");
    expect(headers.get("x-ask-jev-signature")).toBe(
      await signProxyBody(secret, "1700000000000", String(init.body)),
    );
    expect(String(init.body)).not.toContain("apiKey");
  });

  it("does not call the proxy when the signing secret is missing", async () => {
    const fetcher = vi.fn();
    await expect(requestFreeJev(input, settings, { installId: "11111111-1111-4111-8111-111111111111", secret: " ", fetcher })).rejects.toMatchObject({
      code: "quota",
      quota: { limit: "unavailable" },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps a proxy quota distinct from Jev being busy", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "quota", limit: "daily", remaining: 0, allowance: 10 }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "rate_limit" }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "unavailable" }), { status: 503 }));

    await expect(requestFreeJev(input, settings, { installId: "11111111-1111-4111-8111-111111111111", secret, fetcher })).rejects.toMatchObject({
      code: "quota",
      source: "plugin",
      quota: { limit: "daily", remaining: 0, allowance: 10 },
    });
    await expect(requestFreeJev(input, settings, { installId: "11111111-1111-4111-8111-111111111111", secret, fetcher })).rejects.toMatchObject({
      code: "rate_limit",
      source: "jev",
      message: "Jev is busy or rate-limited. Try again shortly.",
    });
    const paused = await requestFreeJev(input, settings, { installId: "11111111-1111-4111-8111-111111111111", secret, fetcher }).catch((error: unknown) => error);
    expect(paused).toMatchObject({
      code: "quota",
      quota: { limit: "unavailable" },
    });
    expect(paused).toEqual(expect.objectContaining({ message: expect.not.stringMatching(/API key/) }));

    const forbidden = await requestFreeJev(input, settings, {
      installId: "11111111-1111-4111-8111-111111111111",
      secret,
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "forbidden" }), { status: 403 })),
    }).catch((error: unknown) => error);
    expect(forbidden).toMatchObject({ quota: { limit: "unavailable" } });
    expect(forbidden).toEqual(expect.objectContaining({ message: expect.not.stringMatching(/API key/) }));
  });
});
