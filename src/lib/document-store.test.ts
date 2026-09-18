import { describe, expect, it } from "vitest";
import { appendReferenceDocument, MAX_REFERENCE_DOCUMENTS } from "./document-store";
import type { ParsedDocument } from "./documents";

const parsed: ParsedDocument = {
  id: "one",
  name: "policy.md",
  size: 100,
  text: "Policy text",
};

describe("appendReferenceDocument", () => {
  it("adds an extracted document with an added timestamp", () => {
    expect(appendReferenceDocument([], parsed, 123)).toEqual([
      { ...parsed, addedAt: 123 },
    ]);
  });

  it("rejects duplicate names", () => {
    expect(() =>
      appendReferenceDocument([{ ...parsed, addedAt: 1 }], {
        ...parsed,
        id: "two",
        name: "POLICY.md",
      }),
    ).toThrow("already exists");
  });

  it("enforces the permanent document limit", () => {
    const existing = Array.from({ length: MAX_REFERENCE_DOCUMENTS }, (_, index) => ({
      ...parsed,
      id: String(index),
      name: `${index}.txt`,
      addedAt: index,
    }));

    expect(() => appendReferenceDocument(existing, parsed)).toThrow(
      `up to ${MAX_REFERENCE_DOCUMENTS}`,
    );
  });
});
