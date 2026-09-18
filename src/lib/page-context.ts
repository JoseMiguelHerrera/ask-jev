import { MAX_CONTEXT_CHARS } from "./limits";

export interface ExtractPageContextOptions {
  document: Document;
  selection?: string;
  maxChars?: number;
}

export const DEFAULT_MAX_CONTEXT_CHARS = MAX_CONTEXT_CHARS;

const EXCLUDED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "NAV",
  "ASIDE",
  "HEADER",
  "FOOTER",
  "FORM",
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "SVG",
  "CANVAS",
  "DIALOG",
]);

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function isHidden(element: Element): boolean {
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") {
    return true;
  }

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style?.display === "none" || style?.visibility === "hidden";
}

function appendLine(lines: string[], seen: Set<string>, value: string | null): void {
  if (!value) return;
  const line = normalizeText(value);
  if (!line || seen.has(line)) return;
  seen.add(line);
  lines.push(line);
}

function collectText(root: Element, title: string): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  appendLine(lines, seen, title);

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendLine(lines, seen, node.textContent);
      return;
    }
    if (!(node instanceof Element) || EXCLUDED_TAGS.has(node.tagName) || isHidden(node)) {
      return;
    }
    if (node instanceof HTMLImageElement) appendLine(lines, seen, node.alt);
    node.childNodes.forEach(visit);
  };

  visit(root);
  return lines;
}

function fitToLimit(lines: string[], maxChars: number): string {
  if (maxChars <= 0) return "";

  const output: string[] = [];
  let remaining = maxChars;
  for (const line of lines) {
    const separatorLength = output.length ? 2 : 0;
    if (remaining <= separatorLength) break;
    const available = remaining - separatorLength;
    const fitted = line.length > available ? line.slice(0, available).trimEnd() : line;
    if (fitted) {
      output.push(fitted);
      remaining -= separatorLength + fitted.length;
    }
    if (fitted.length < line.length) break;
  }
  return truncateUtf8(output.join("\n\n"), maxChars);
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

export function extractPageContext({
  document,
  selection = document.defaultView?.getSelection()?.toString() ?? "",
  maxChars = DEFAULT_MAX_CONTEXT_CHARS,
}: ExtractPageContextOptions): string {
  const selected = normalizeText(selection);
  if (selected) return truncateUtf8(selected.slice(0, maxChars).trimEnd(), maxChars);

  const root =
    document.querySelector("main, article, [role='main']") ?? document.body;
  if (!root) return "";

  return fitToLimit(collectText(root, document.title), maxChars);
}
