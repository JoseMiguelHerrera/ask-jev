import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("normalizeSettings", () => {
  it("uses safe defaults for missing values without inventing an API key", () => {
    expect(normalizeSettings({ model: "  " })).toEqual(DEFAULT_SETTINGS);
  });

  it("trims saved settings", () => {
    expect(
      normalizeSettings({
        apiKey: " key ",
        endpoint: " https://api.typesafe.ai/v1/systemone ",
        model: " jev-1.13.0 ",
      }),
    ).toEqual({
      apiKey: "key",
      endpoint: "https://api.typesafe.ai/v1/systemone",
      model: "jev-1.13.0",
    });
  });
});
