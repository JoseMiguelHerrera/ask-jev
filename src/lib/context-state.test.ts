import { describe, expect, it } from "vitest";
import { buildJevState } from "./context-state";

describe("buildJevState", () => {
  it("uses webpage text directly when no documents are selected", () => {
    expect(buildJevState({ pageContent: "Page text", documents: [] })).toEqual({
      webpage: "Page text",
    });
  });

  it("labels ephemeral and permanent document sources", () => {
    expect(
      buildJevState({
        pageContent: "Page text",
        documents: [
          { name: "resume.pdf", kind: "ephemeral", text: "Resume text" },
          { name: "policy.md", kind: "permanent", text: "Policy text" },
        ],
      }),
    ).toMatchObject({
      webpage: "Page text",
      documents: [
        { name: "resume.pdf", kind: "ephemeral", text: "Resume text" },
        { name: "policy.md", kind: "permanent", text: "Policy text" },
      ],
    });
  });

  it("shares a strict byte budget without starving selected sources", () => {
    const state = buildJevState(
      {
        pageContent: `PAGE_NEEDLE ${"page ".repeat(200)}`,
        documents: [
          {
            name: "one.txt",
            kind: "ephemeral",
            text: `DOC_ONE_NEEDLE ${"one ".repeat(200)}`,
          },
          {
            name: "two.txt",
            kind: "permanent",
            text: `DOC_TWO_NEEDLE ${"two ".repeat(200)}`,
          },
        ],
      },
      420,
    );

    expect(state.webpage).toContain("PAGE_NEEDLE");
    expect(state.documents?.[0].text).toContain("DOC_ONE_NEEDLE");
    expect(state.documents?.[1].text).toContain("DOC_TWO_NEEDLE");
    expect(new TextEncoder().encode(JSON.stringify(state)).byteLength).toBeLessThanOrEqual(420);
  });

  it("budgets document metadata as well as text", () => {
    const documents = Array.from({ length: 23 }, (_, index) => ({
      name: `${index}-${"\u0001".repeat(255)}`,
      kind: "permanent" as const,
      text: "Document text",
    }));

    const state = buildJevState({ pageContent: "Page", documents });

    expect(new TextEncoder().encode(JSON.stringify(state)).byteLength).toBeLessThanOrEqual(
      24_000,
    );
  });
});
