// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { isAskJevMessage } from "./messages";
import { extractPageContext } from "./page-context";

describe("extractPageContext", () => {
  it("uses selected text as the primary context", () => {
    document.body.innerHTML = "<main>Entire page text</main>";

    expect(
      extractPageContext({
        document,
        selection: "  Applicants must live in the US.  ",
      }),
    ).toBe("Applicants must live in the US.");
  });

  it("extracts readable content and removes page chrome", () => {
    document.title = "Staff Engineer";
    document.body.innerHTML = `
      <nav>Home Pricing Sign in</nav>
      <main>
        <h1>Staff Engineer</h1>
        <p>Build distributed systems for millions of users.</p>
        <p hidden>Internal draft</p>
        <div aria-hidden="true">Decorative copy</div>
        <img alt="Architecture diagram">
      </main>
      <form><button>Apply now</button></form>
      <script>window.bad = "ignore me"</script>
    `;

    const context = extractPageContext({ document, selection: "" });

    expect(context).toContain("Staff Engineer");
    expect(context).toContain("Build distributed systems");
    expect(context).toContain("Architecture diagram");
    expect(context).not.toContain("Home Pricing");
    expect(context).not.toContain("Internal draft");
    expect(context).not.toContain("Apply now");
    expect(context).not.toContain("ignore me");
  });

  it("deduplicates text and respects the character limit", () => {
    document.body.innerHTML = `
      <main>
        <p>Repeated sentence</p>
        <p>Repeated sentence</p>
        <p>${"useful ".repeat(100)}</p>
      </main>
    `;

    const context = extractPageContext({
      document,
      selection: "",
      maxChars: 90,
    });

    expect(context.match(/Repeated sentence/g)).toHaveLength(1);
    expect(context.length).toBeLessThanOrEqual(90);
  });

  it("respects the context byte budget for non-ASCII text", () => {
    document.body.innerHTML = `<main><p>${"é".repeat(100)}</p></main>`;

    const context = extractPageContext({ document, selection: "", maxChars: 90 });

    expect(new TextEncoder().encode(context).byteLength).toBeLessThanOrEqual(90);
  });

  it("keeps extracted job-page text inside the extension message budget", () => {
    document.body.innerHTML = `<main><p>${"Staff engineer role. ".repeat(4_000)}</p></main>`;

    const pageContent = extractPageContext({ document, selection: "" });

    expect(
      isAskJevMessage({
        type: "ASK_JEV_REQUEST",
        payload: {
          pageContent,
          ephemeralDocuments: [],
          referenceDocumentIds: [],
          question: "is this job a good fit for me?",
          choices: ["YES", "NO", "UNCLEAR"],
        },
      }),
    ).toBe(true);
  });

  it("returns an empty string when no readable text exists", () => {
    document.title = "";
    document.body.innerHTML = "<canvas></canvas><script>ignored</script>";

    expect(extractPageContext({ document, selection: "" })).toBe("");
  });
});
