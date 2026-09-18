import { describe, expect, it } from "vitest";
import { presentAskError } from "./ask-error";

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
