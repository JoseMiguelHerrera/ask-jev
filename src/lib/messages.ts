import type { ReferenceDocumentMetadata } from "./document-store";
import {
  MAX_DOCUMENT_FILE_BYTES,
  MAX_DOCUMENT_NAME_BYTES,
  MAX_EXTRACTED_DOCUMENT_BYTES,
  type ParsedDocument,
} from "./documents";
import type { AskErrorSource, JevChoiceResult, JevErrorCode, QuotaDetails } from "./jev";
import type { QuotaSnapshot } from "./quota-status";
import { MAX_CHOICE_LENGTH, MAX_CHOICES, MAX_QUESTION_LENGTH } from "./choices";
import { MAX_CONTEXT_BYTES, MAX_CONTEXT_CHARS } from "./limits";

export const MAX_EPHEMERAL_DOCUMENTS = 3;

export interface TogglePaletteMessage {
  type: "ASK_JEV_TOGGLE";
}

export interface AskSubmissionPayload {
  pageContent: string;
  ephemeralDocuments: ParsedDocument[];
  referenceDocumentIds: string[];
  question: string;
  choices: string[];
}

export interface AskJevMessage {
  type: "ASK_JEV_REQUEST";
  requestId?: string;
  payload: AskSubmissionPayload;
}

export interface GetReferenceDocumentsMessage {
  type: "ASK_JEV_GET_REFERENCE_DOCUMENTS";
}

export interface OpenOptionsMessage {
  type: "ASK_JEV_OPEN_OPTIONS";
  intent?: "apiKey";
}

export interface QuotaStatusMessage {
  type: "ASK_JEV_QUOTA";
}

export type QuotaStatusResponse =
  | { ok: true; quota: QuotaSnapshot }
  | { ok: false; error: string };

export interface AddReferenceDocumentMessage {
  type: "ASK_JEV_ADD_REFERENCE_DOCUMENT";
  document: ParsedDocument;
}

export interface RemoveReferenceDocumentMessage {
  type: "ASK_JEV_REMOVE_REFERENCE_DOCUMENT";
  id: string;
}

export type AskJevResponse =
  | {
      ok: true;
      result: JevChoiceResult;
      latencyMs: number;
      remaining?: number;
    }
  | {
      ok: false;
      code: JevErrorCode;
      source: AskErrorSource;
      error: string;
      quota?: QuotaDetails;
    };

export type ReferenceDocumentsResponse =
  | { ok: true; documents: ReferenceDocumentMetadata[] }
  | { ok: false; error: string };

export function isAddReferenceDocumentMessage(
  value: unknown,
): value is AddReferenceDocumentMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === "ASK_JEV_ADD_REFERENCE_DOCUMENT" &&
    isParsedDocument(message.document)
  );
}

export function isRemoveReferenceDocumentMessage(
  value: unknown,
): value is RemoveReferenceDocumentMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === "ASK_JEV_REMOVE_REFERENCE_DOCUMENT" &&
    typeof message.id === "string" &&
    message.id.length <= 64
  );
}

function isParsedDocument(value: unknown): value is ParsedDocument {
  if (typeof value !== "object" || value === null) return false;
  const document = value as Record<string, unknown>;
  return (
    typeof document.id === "string" &&
    document.id.length <= 64 &&
    typeof document.name === "string" &&
    new TextEncoder().encode(document.name).byteLength <= MAX_DOCUMENT_NAME_BYTES &&
    typeof document.size === "number" &&
    document.size >= 0 &&
    document.size <= MAX_DOCUMENT_FILE_BYTES &&
    typeof document.text === "string" &&
    new TextEncoder().encode(document.text).byteLength <= MAX_EXTRACTED_DOCUMENT_BYTES
  );
}

export function isAskJevRequestType(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).type === "ASK_JEV_REQUEST"
  );
}

export function rejectionForAskJevMessage(value: unknown): AskJevResponse | undefined {
  if (!isAskJevRequestType(value) || isAskJevMessage(value)) return undefined;
  return {
    ok: false,
    code: "bad_request",
    source: "plugin",
    error: "Ask Jev could not send this page. Refresh and try again.",
  };
}

export function isAskJevMessage(value: unknown): value is AskJevMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message.type !== "ASK_JEV_REQUEST") return false;
  if (
    message.requestId !== undefined &&
    (typeof message.requestId !== "string" || message.requestId.length === 0 || message.requestId.length > 80)
  ) {
    return false;
  }
  if (typeof message.payload !== "object" || message.payload === null) return false;
  const payload = message.payload as Record<string, unknown>;
  return (
    typeof payload.pageContent === "string" &&
    payload.pageContent.length <= MAX_CONTEXT_CHARS &&
    new TextEncoder().encode(payload.pageContent).byteLength <= MAX_CONTEXT_BYTES &&
    Array.isArray(payload.ephemeralDocuments) &&
    payload.ephemeralDocuments.length <= MAX_EPHEMERAL_DOCUMENTS &&
    payload.ephemeralDocuments.every(isParsedDocument) &&
    Array.isArray(payload.referenceDocumentIds) &&
    payload.referenceDocumentIds.length <= 20 &&
    payload.referenceDocumentIds.every(
      (id) => typeof id === "string" && id.length <= 64,
    ) &&
    typeof payload.question === "string" &&
    payload.question.length <= MAX_QUESTION_LENGTH &&
    Array.isArray(payload.choices) &&
    payload.choices.length <= MAX_CHOICES &&
    payload.choices.every(
      (choice) => typeof choice === "string" && choice.length <= MAX_CHOICE_LENGTH,
    )
  );
}

export function isGetReferenceDocumentsMessage(
  value: unknown,
): value is GetReferenceDocumentsMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).type === "ASK_JEV_GET_REFERENCE_DOCUMENTS"
  );
}

export function isQuotaStatusMessage(value: unknown): value is QuotaStatusMessage {
  return typeof value === "object" && value !== null && (value as Record<string, unknown>).type === "ASK_JEV_QUOTA";
}

export function isOpenOptionsMessage(value: unknown): value is OpenOptionsMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message.type !== "ASK_JEV_OPEN_OPTIONS") return false;
  return message.intent === undefined || message.intent === "apiKey";
}

export function openAskJevSettings(
  send: (message: unknown) => Promise<unknown> = (message) =>
    chrome.runtime.sendMessage(message),
  intent?: "apiKey",
): Promise<void> {
  const message: OpenOptionsMessage = intent ? { type: "ASK_JEV_OPEN_OPTIONS", intent } : { type: "ASK_JEV_OPEN_OPTIONS" };
  return send(message).then(() => undefined);
}

export function openAskJevApiKeySettings(
  send: (message: unknown) => Promise<unknown> = (message) =>
    chrome.runtime.sendMessage(message),
): Promise<void> {
  return openAskJevSettings(send, "apiKey");
}
