import { describe, expect, it, vi } from "vitest";
import {
  isAddReferenceDocumentMessage,
  isAskJevMessage,
  isAskJevRequestType,
  isOpenOptionsMessage,
  isRemoveReferenceDocumentMessage,
  openAskJevSettings,
  rejectionForAskJevMessage,
} from "./messages";

const validMessage = {
  type: "ASK_JEV_REQUEST",
  payload: {
    pageContent: "Readable page text",
    ephemeralDocuments: [],
    referenceDocumentIds: [],
    question: "Is this maintained?",
    choices: ["YES", "NO", "UNCLEAR"],
  },
};

describe("isAskJevMessage", () => {
  it("accepts a bounded ask request", () => {
    expect(isAskJevMessage(validMessage)).toBe(true);
  });

  it("rejects oversized untrusted context", () => {
    expect(
      isAskJevMessage({
        ...validMessage,
        payload: { ...validMessage.payload, pageContent: "x".repeat(24_001) },
      }),
    ).toBe(false);
    expect(
      isAskJevMessage({
        ...validMessage,
        payload: { ...validMessage.payload, pageContent: "é".repeat(12_001) },
      }),
    ).toBe(false);
  });

  it("rejects too many or oversized raw choices", () => {
    expect(
      isAskJevMessage({
        ...validMessage,
        payload: { ...validMessage.payload, choices: Array(9).fill("choice") },
      }),
    ).toBe(false);
    expect(
      isAskJevMessage({
        ...validMessage,
        payload: { ...validMessage.payload, choices: ["x".repeat(81), "no"] },
      }),
    ).toBe(false);
  });
});

describe("isOpenOptionsMessage", () => {
  it("accepts the settings open request from the palette", () => {
    expect(isOpenOptionsMessage({ type: "ASK_JEV_OPEN_OPTIONS" })).toBe(true);
    expect(isOpenOptionsMessage({ type: "ASK_JEV_PING" })).toBe(false);
  });

  it("asks the service worker to open Settings", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    await openAskJevSettings(send);
    expect(send).toHaveBeenCalledWith({ type: "ASK_JEV_OPEN_OPTIONS" });
  });
});

describe("rejectionForAskJevMessage", () => {
  it("returns a user-facing error instead of dropping an oversized ask", () => {
    expect(
      rejectionForAskJevMessage({
        ...validMessage,
        payload: { ...validMessage.payload, pageContent: "x".repeat(24_001) },
      }),
    ).toEqual({
      ok: false,
      code: "bad_request",
      source: "plugin",
      error: "Ask Jev could not send this page. Refresh and try again.",
    });
  });

  it("does not treat a valid ask as rejected", () => {
    expect(isAskJevRequestType(validMessage)).toBe(true);
    expect(rejectionForAskJevMessage(validMessage)).toBeUndefined();
  });
});

describe("reference document mutation messages", () => {
  it("accepts bounded adds and removes", () => {
    expect(
      isAddReferenceDocumentMessage({
        type: "ASK_JEV_ADD_REFERENCE_DOCUMENT",
        document: {
          id: "doc-1",
          name: "policy.md",
          size: 12,
          text: "Policy text",
        },
      }),
    ).toBe(true);
    expect(
      isRemoveReferenceDocumentMessage({
        type: "ASK_JEV_REMOVE_REFERENCE_DOCUMENT",
        id: "doc-1",
      }),
    ).toBe(true);
  });

  it("rejects oversized mutation data", () => {
    expect(
      isAddReferenceDocumentMessage({
        type: "ASK_JEV_ADD_REFERENCE_DOCUMENT",
        document: {
          id: "doc-1",
          name: "policy.md",
          size: 12,
          text: "x".repeat(250_001),
        },
      }),
    ).toBe(false);
    expect(
      isRemoveReferenceDocumentMessage({
        type: "ASK_JEV_REMOVE_REFERENCE_DOCUMENT",
        id: "x".repeat(65),
      }),
    ).toBe(false);
  });
});
