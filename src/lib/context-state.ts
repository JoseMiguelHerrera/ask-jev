import { MAX_CONTEXT_BYTES } from "./limits";

export type DocumentKind = "ephemeral" | "permanent";

export interface ContextDocument {
  name: string;
  kind: DocumentKind;
  text: string;
}

export interface JevState {
  webpage: string;
  documents?: ContextDocument[];
}

const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (byteLength(value) <= maxBytes) return value;
  let low = 0;
  let high = Math.min(value.length, maxBytes);
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    if (byteLength(value.slice(0, midpoint)) <= maxBytes) low = midpoint;
    else high = midpoint - 1;
  }
  return value.slice(0, low).trimEnd();
}

function allocateFairly(values: string[], totalBytes: number): number[] {
  const sizes = values.map(byteLength);
  const allocations = Array(values.length).fill(0) as number[];
  const pending = new Set(values.map((_, index) => index));
  let remaining = Math.max(0, totalBytes);

  while (pending.size && remaining > 0) {
    const share = Math.floor(remaining / pending.size);
    if (share <= 0) break;
    const fitting = [...pending].filter((index) => sizes[index] <= share);
    if (!fitting.length) {
      for (const index of pending) allocations[index] = share;
      break;
    }
    for (const index of fitting) {
      allocations[index] = sizes[index];
      remaining -= sizes[index];
      pending.delete(index);
    }
  }

  return allocations;
}

function serializedBytes(state: JevState): number {
  return byteLength(JSON.stringify(state));
}

export function buildJevState(
  input: { pageContent: string; documents: ContextDocument[] },
  maxBytes = MAX_CONTEXT_BYTES,
): JevState {
  const sanitizedDocuments = input.documents.map((document) => ({
    ...document,
    name: truncateUtf8(
      document.name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(),
      120,
    ),
  }));
  const documents = sanitizedDocuments.map((document) => ({ ...document, text: "" }));
  const emptyState: JevState = {
    webpage: "",
    ...(documents.length ? { documents } : {}),
  };
  const available = Math.max(0, maxBytes - serializedBytes(emptyState));
  const sourceTexts = [input.pageContent, ...sanitizedDocuments.map((document) => document.text)];
  const allocations = allocateFairly(sourceTexts, available);

  const makeState = (scale: number): JevState => ({
    webpage: truncateUtf8(input.pageContent, Math.floor(allocations[0] * scale)),
    ...(sanitizedDocuments.length
      ? {
          documents: sanitizedDocuments.map((document, index) => ({
            ...document,
            text: truncateUtf8(
              document.text,
              Math.floor(allocations[index + 1] * scale),
            ),
          })),
        }
      : {}),
  });

  let state = makeState(1);
  if (serializedBytes(state) <= maxBytes) return state;

  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const midpoint = (low + high) / 2;
    const candidate = makeState(midpoint);
    if (serializedBytes(candidate) <= maxBytes) {
      low = midpoint;
      state = candidate;
    } else {
      high = midpoint;
    }
  }
  return state;
}
