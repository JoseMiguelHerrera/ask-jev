export const MAX_DOCUMENT_FILE_BYTES = 5_000_000;
export const MAX_EXTRACTED_DOCUMENT_BYTES = 250_000;
export const MAX_PDF_PAGES = 500;
export const MAX_DOCUMENT_NAME_BYTES = 120;

const SUPPORTED_EXTENSIONS = new Set(["txt", "md", "markdown", "json", "csv", "pdf"]);

export interface ParsedDocument {
  id: string;
  name: string;
  size: number;
  text: string;
}

export type PdfTextExtractor = (file: File) => Promise<string>;

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLocaleLowerCase() ?? "";
}

function normalizeDocumentText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).byteLength <= maxBytes) return value;
  let low = 0;
  let high = Math.min(value.length, maxBytes);
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    if (encoder.encode(value.slice(0, midpoint)).byteLength <= maxBytes) low = midpoint;
    else high = midpoint - 1;
  }
  return value.slice(0, low).trimEnd();
}

export function validateDocumentFile(file: File): string | null {
  if (!SUPPORTED_EXTENSIONS.has(extensionOf(file.name))) {
    return "Choose a TXT, Markdown, JSON, CSV, or PDF document.";
  }
  if (file.size > MAX_DOCUMENT_FILE_BYTES) {
    return "Keep each document at or below 5 MB.";
  }
  return null;
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("assets/pdf.worker.min.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: chrome.runtime.getURL("assets/cmaps/"),
    cMapPacked: true,
    useWorkerFetch: true,
  });
  const pages: string[] = [];
  let remainingBytes = MAX_EXTRACTED_DOCUMENT_BYTES;
  let pdf: Awaited<typeof loadingTask.promise> | undefined;

  try {
    pdf = await loadingTask.promise;
    const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES);
    for (let pageNumber = 1; pageNumber <= pageLimit && remainingBytes > 0; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const pageText = normalizeDocumentText(
          content.items
            .map((item) =>
              typeof item === "object" && item !== null && "str" in item
                ? String(item.str)
                : "",
            )
            .join(" "),
        );
        const fitted = truncateUtf8(pageText, remainingBytes);
        if (fitted) {
          pages.push(fitted);
          remainingBytes -= new TextEncoder().encode(fitted).byteLength + 2;
        }
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await pdf?.cleanup();
    await loadingTask.destroy();
  }

  return pages.join("\n\n");
}

export async function parseDocumentFile(
  file: File,
  extractPdf: PdfTextExtractor = extractPdfText,
): Promise<ParsedDocument> {
  const validationError = validateDocumentFile(file);
  if (validationError) throw new Error(validationError);

  const rawText =
    extensionOf(file.name) === "pdf" ? await extractPdf(file) : await file.text();
  const text = truncateUtf8(
    normalizeDocumentText(rawText),
    MAX_EXTRACTED_DOCUMENT_BYTES,
  );
  if (!text) throw new Error(`“${file.name}” contains no readable text.`);

  return {
    id: crypto.randomUUID(),
    name: truncateUtf8(
      file.name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(),
      MAX_DOCUMENT_NAME_BYTES,
    ),
    size: file.size,
    text,
  };
}
