import { describe, expect, it } from "vitest";
import { cleanChoices, validateAskInput } from "./choices";

describe("cleanChoices", () => {
  it("trims labels and removes case-insensitive duplicates", () => {
    expect(cleanChoices([" YES ", "no", "yes", "", "Unclear"])).toEqual([
      "YES",
      "no",
      "Unclear",
    ]);
  });
});

describe("validateAskInput", () => {
  it("requires a question", () => {
    expect(validateAskInput("  ", ["Yes", "No"])).toBe("Enter a question.");
  });

  it("requires at least two distinct choices", () => {
    expect(validateAskInput("Is it maintained?", ["Yes", " yes "])).toBe(
      "Add at least two different answers.",
    );
  });

  it("accepts a concise question with distinct choices", () => {
    expect(validateAskInput("Which license?", ["MIT", "Apache-2.0"])).toBeNull();
  });
});
