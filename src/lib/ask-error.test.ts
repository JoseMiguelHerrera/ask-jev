import { describe, expect, it } from "vitest";
import { burstQuotaBody, burstSecondsLeft, presentAskError } from "./ask-error";

describe("presentAskError", () => {
  it("labels TypeSafe failures as a Jev error, not a plugin bug", () => {
    expect(
      presentAskError({
        ok: false,
        code: "rate_limit",
        source: "jev",
        error: "Jev is busy or rate-limited. Try again shortly.",
      }),
    ).toEqual({
      source: "jev",
      label: "Jev error",
      message: "Jev is busy or rate-limited. Try again shortly.",
      attribution: "This came from TypeSafe Jev, not the Ask Jev extension.",
    });
  });

  it("gives each free-question limit its own panel and leaves Jev busy alone", () => {
    expect(presentAskError({
      ok: false,
      code: "quota",
      source: "plugin",
      error: "Free questions are limited.",
      quota: { limit: "daily", remaining: 0, allowance: 10 },
    })).toMatchObject({
      quota: {
        heading: "Free questions used up",
        body: "This install has used today's 10 free questions. They reset at 00:00 UTC. A personal TypeSafe key removes the cap.",
      },
    });
    expect(presentAskError({
      ok: false,
      code: "quota",
      error: "paused",
      quota: { limit: "network" },
    }).quota?.heading).toBe("Free questions are paused on this network");
    expect(presentAskError({
      ok: false,
      code: "quota",
      error: "paused",
      quota: { limit: "global" },
    }).quota?.heading).toBe("Free questions are paused");
    expect(presentAskError({
      ok: false,
      code: "quota",
      error: "slow",
      quota: { limit: "burst", remaining: 97, retryAfterSeconds: 12, burstLimit: 5, burstWindowSeconds: 10 },
    }).quota?.body).toBe("Free questions are limited to 5 every 10 seconds. 97 left today. Wait 12 seconds, or add your own key.");
    expect(presentAskError({
      ok: false,
      code: "quota",
      error: "slow",
      quota: { limit: "burst", remaining: 97, retryAfterSeconds: 12 },
    }).quota?.body).not.toMatch(/3|30/);
    const unavailable = presentAskError({
      ok: false,
      code: "quota",
      error: "Free questions are temporarily unavailable.",
      quota: { limit: "unavailable" },
    });
    expect(unavailable.quota?.heading).toBe("Free questions are temporarily unavailable");
    expect(unavailable.quota?.body).not.toMatch(/API key/);
    expect(presentAskError({
      ok: false,
      code: "rate_limit",
      source: "jev",
      error: "Jev is busy or rate-limited. Try again shortly.",
    }).quota).toBeUndefined();
  });

  it("counts a burst wait down to zero from the moment it arrives", () => {
    const receivedAt = 1_000_000;
    expect(burstSecondsLeft(22, receivedAt, receivedAt)).toBe(22);
    expect(burstSecondsLeft(22, receivedAt, receivedAt + 1_001)).toBe(21);
    expect(burstSecondsLeft(22, receivedAt, receivedAt + 22_000)).toBe(0);
    expect(burstQuotaBody(6, 1, 5, 10)).toBe("Free questions are limited to 5 every 10 seconds. 6 left today. Wait 1 second, or add your own key.");
    expect(burstQuotaBody(6, 0, 5, 10)).toBe("Free questions are limited to 5 every 10 seconds. 6 left today. You can ask again, or add your own key.");
    expect(presentAskError({
      ok: false,
      code: "quota",
      error: "used",
      quota: { limit: "daily", remaining: 0 },
    }).quota?.body).not.toMatch(/100/);
  });

  it("keeps local validation and extension failures on the plugin", () => {
    expect(presentAskError("Enter a question.")).toEqual({
      source: "plugin",
      label: "Ask Jev",
      message: "Enter a question.",
      attribution: "",
    });
    expect(
      presentAskError({
        ok: false,
        code: "bad_request",
        source: "plugin",
        error: "This page is not supported.",
      }),
    ).toMatchObject({
      source: "plugin",
      label: "Ask Jev",
      attribution: "",
    });
  });
});
