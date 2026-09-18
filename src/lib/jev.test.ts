import { describe, expect, it, vi } from "vitest";
import {
  buildJevRequest,
  JevRequestError,
  parseChoiceResult,
  requestJev,
} from "./jev";

const settings = {
  apiKey: "test-key",
  endpoint: "https://api.typesafe.ai/v1/systemone",
  model: "jev-latest",
};

describe("buildJevRequest", () => {
  it("maps exact answer labels to native Choice criteria", () => {
    expect(
      buildJevRequest(
        { webpage: "Page text" },
        "Which license?",
        ["MIT", "Apache-2.0"],
        "jev-latest",
      ),
    ).toEqual({
      state: { webpage: "Page text" },
      model: "jev-latest",
      questions: {
        judgment: {
          type: "choice",
          instructions: "Which license?",
          criteria: {
            MIT: null,
            "Apache-2.0": null,
          },
        },
      },
    });
  });
});

describe("parseChoiceResult", () => {
  it("returns every supplied choice and its probability", () => {
    expect(
      parseChoiceResult(
        {
          model: "jev-1.13.0",
          answers: {
            judgment: {
              type: "choice",
              choice: "YES",
              probabilities: { YES: 0.87, NO: 0.09, UNCLEAR: 0.04 },
              confidence: 0.7,
            },
          },
        },
        ["YES", "NO", "UNCLEAR"],
      ),
    ).toEqual({
      model: "jev-1.13.0",
      selected: "YES",
      probabilities: [
        { label: "YES", probability: 0.87 },
        { label: "NO", probability: 0.09 },
        { label: "UNCLEAR", probability: 0.04 },
      ],
    });
  });

  it("rejects malformed probability responses", () => {
    expect(() =>
      parseChoiceResult(
        {
          answers: {
            judgment: {
              type: "choice",
              choice: "YES",
              probabilities: { YES: 1.4, NO: -0.4 },
            },
          },
        },
        ["YES", "NO"],
      ),
    ).toThrow("Jev returned an invalid probability");
  });
});

describe("requestJev", () => {
  it("attributes a rejected evaluation to Jev and includes its reason", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "state exceeds the model budget" }), {
        status: 422,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      requestJev(
        { context: { webpage: "Page" }, question: "Question?", choices: ["A", "B"] },
        settings,
        fetcher,
      ),
    ).rejects.toMatchObject({
      code: "bad_request",
      source: "jev",
      message: "Jev rejected this question: state exceeds the model budget",
    });
  });

  it("maps rate limits to a concise user-facing error", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "limit" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      requestJev(
        { context: { webpage: "Page" }, question: "Question?", choices: ["A", "B"] },
        settings,
        fetcher,
      ),
    ).rejects.toMatchObject({
      code: "rate_limit",
      message: "Jev is busy or rate-limited. Try again shortly.",
    });
  });

  it("sends the key only in the authorization header", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "jev-1.13.0",
          answers: {
            judgment: {
              type: "choice",
              choice: "A",
              probabilities: { A: 0.6, B: 0.4 },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await requestJev(
      { context: { webpage: "Page" }, question: "Question?", choices: ["A", "B"] },
      settings,
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledWith(
      settings.endpoint,
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
      }),
    );
    expect(fetcher.mock.calls[0][1].body).not.toContain("test-key");
  });
});
