import { describe, expect, it, vi } from "vitest";
import {
  MAX_DOCUMENT_FILE_BYTES,
  parseDocumentFile,
  validateDocumentFile,
} from "./documents";

describe("validateDocumentFile", () => {
  it("accepts supported text and PDF extensions", () => {
    expect(validateDocumentFile({ name: "notes.md", size: 100 } as File)).toBeNull();
    expect(validateDocumentFile({ name: "report.PDF", size: 100 } as File)).toBeNull();
  });

  it("rejects unsupported and oversized files", () => {
    expect(validateDocumentFile({ name: "archive.zip", size: 100 } as File)).toContain(
      "TXT, Markdown, JSON, CSV, or PDF",
    );
    expect(
      validateDocumentFile({
        name: "large.pdf",
        size: MAX_DOCUMENT_FILE_BYTES + 1,
      } as File),
    ).toContain("5 MB");
  });
});

describe("parseDocumentFile", () => {
  it("reads and normalizes a text document locally", async () => {
    const file = new File(["First line \n\n  Second line"], "notes.txt", {
      type: "text/plain",
    });

    const parsed = await parseDocumentFile(file);

    expect(parsed).toMatchObject({
      name: "notes.txt",
      size: file.size,
      text: "First line \n\n  Second line",
    });
  });

  it("sanitizes document names used as Jev metadata", async () => {
    const file = new File(["Text"], `unsafe\n${"x".repeat(160)}.txt`);

    const parsed = await parseDocumentFile(file);

    expect(parsed.name).not.toContain("\n");
    expect(new TextEncoder().encode(parsed.name).byteLength).toBeLessThanOrEqual(120);
  });

  it("uses the PDF extractor only for PDFs", async () => {
    const extractPdf = vi.fn().mockResolvedValue("Extracted PDF text");
    const file = new File(["%PDF"], "report.pdf", { type: "application/pdf" });

    const parsed = await parseDocumentFile(file, extractPdf);

    expect(extractPdf).toHaveBeenCalledWith(file);
    expect(parsed.text).toBe("Extracted PDF text");
  });

  it("rejects a document with no readable text", async () => {
    const file = new File(["   "], "empty.txt", { type: "text/plain" });

    await expect(parseDocumentFile(file)).rejects.toThrow("no readable text");
  });
});
