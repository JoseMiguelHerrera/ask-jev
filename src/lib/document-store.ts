import type { ParsedDocument } from "./documents";

export const MAX_REFERENCE_DOCUMENTS = 20;

export interface StoredReferenceDocument extends ParsedDocument {
  addedAt: number;
}

export type ReferenceDocumentMetadata = Omit<StoredReferenceDocument, "text">;

const REFERENCE_DOCUMENTS_KEY = "referenceDocuments";

export function appendReferenceDocument(
  existing: StoredReferenceDocument[],
  document: ParsedDocument,
  addedAt = Date.now(),
): StoredReferenceDocument[] {
  if (existing.length >= MAX_REFERENCE_DOCUMENTS) {
    throw new Error(`Store up to ${MAX_REFERENCE_DOCUMENTS} permanent documents.`);
  }
  if (
    existing.some(
      (item) => item.name.toLocaleLowerCase() === document.name.toLocaleLowerCase(),
    )
  ) {
    throw new Error(`“${document.name}” already exists in the document library.`);
  }
  return [...existing, { ...document, addedAt }];
}

function isStoredDocument(value: unknown): value is StoredReferenceDocument {
  if (typeof value !== "object" || value === null) return false;
  const document = value as Record<string, unknown>;
  return (
    typeof document.id === "string" &&
    typeof document.name === "string" &&
    typeof document.size === "number" &&
    typeof document.text === "string" &&
    typeof document.addedAt === "number"
  );
}

export async function loadReferenceDocuments(): Promise<StoredReferenceDocument[]> {
  const stored = await chrome.storage.local.get(REFERENCE_DOCUMENTS_KEY);
  const documents = stored[REFERENCE_DOCUMENTS_KEY];
  return Array.isArray(documents) ? documents.filter(isStoredDocument) : [];
}

export async function saveReferenceDocuments(
  documents: StoredReferenceDocument[],
): Promise<void> {
  await chrome.storage.local.set({ [REFERENCE_DOCUMENTS_KEY]: documents });
}

export async function addReferenceDocument(
  document: ParsedDocument,
): Promise<StoredReferenceDocument[]> {
  const updated = appendReferenceDocument(await loadReferenceDocuments(), document);
  await saveReferenceDocuments(updated);
  return updated;
}

export async function removeReferenceDocument(id: string): Promise<StoredReferenceDocument[]> {
  const updated = (await loadReferenceDocuments()).filter((document) => document.id !== id);
  await saveReferenceDocuments(updated);
  return updated;
}

export function toReferenceMetadata(
  documents: StoredReferenceDocument[],
): ReferenceDocumentMetadata[] {
  return documents.map(({ text: _text, ...metadata }) => metadata);
}
