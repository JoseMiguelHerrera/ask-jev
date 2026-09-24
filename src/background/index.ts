import { cleanChoices, validateAskInput } from "../lib/choices";
import { buildJevState } from "../lib/context-state";
import {
  addReferenceDocument,
  loadReferenceDocuments,
  removeReferenceDocument,
  toReferenceMetadata,
} from "../lib/document-store";
import { loadInstallId } from "../lib/install-id";
import { JevRequestError, requestJev } from "../lib/jev";
import { proxyClientSecret, requestFreeJev, requestQuota } from "../lib/proxy";
import {
  isAddReferenceDocumentMessage,
  isAskJevMessage,
  isGetReferenceDocumentsMessage,
  isOpenOptionsMessage,
  isQuotaStatusMessage,
  isRemoveReferenceDocumentMessage,
  rejectionForAskJevMessage,
  type AskJevResponse,
  type QuotaStatusResponse,
  type ReferenceDocumentsResponse,
} from "../lib/messages";
import { DEFAULT_SETTINGS, normalizeSettings } from "../lib/settings";

void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

let documentMutationQueue = Promise.resolve();
const askAttempts = new Map<string, Promise<AskJevResponse>>();

function askOnce(requestId: string | undefined, run: () => Promise<AskJevResponse>): Promise<AskJevResponse> {
  if (!requestId) return run();
  const current = askAttempts.get(requestId);
  if (current) return current;
  const pending = run();
  askAttempts.set(requestId, pending);
  const forget = () => {
    if (askAttempts.get(requestId) === pending) askAttempts.delete(requestId);
  };
  setTimeout(forget, 30_000);
  return pending;
}

function enqueueDocumentMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = documentMutationQueue.then(operation, operation);
  documentMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function isSupportedPage(url?: string): boolean {
  return Boolean(url && (url.startsWith("https://") || url.startsWith("http://")));
}

async function togglePalette(tab?: chrome.tabs.Tab): Promise<void> {
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "ASK_JEV_TOGGLE" });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["assets/content.js"],
      });
      await chrome.tabs.sendMessage(tab.id, { type: "ASK_JEV_TOGGLE" });
    } catch {
      await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#f386a1" });
      await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
      await chrome.action.setTitle({
        tabId: tab.id,
        title: "Ask Jev only works on normal web pages",
      });
      return;
    }
  }

  await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  await chrome.action.setTitle({ tabId: tab.id, title: "Ask Jev" });
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-ask-jev") void togglePalette(tab);
});

chrome.action.onClicked.addListener((tab) => {
  void togglePalette(tab);
});

chrome.runtime.onInstalled.addListener((details) => {
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  if (details.reason === "install") void chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "ASK_JEV_PING"
  ) {
    sendResponse({ ok: true });
    return false;
  }

  if (isOpenOptionsMessage(message)) {
    const open = message.intent === "apiKey"
      ? chrome.storage.local.set({ settingsIntent: "apiKey" }).then(() => chrome.runtime.openOptionsPage())
      : chrome.runtime.openOptionsPage();
    void open;
    sendResponse({ ok: true });
    return false;
  }

  const trustedSender =
    sender.id === chrome.runtime.id &&
    Boolean(sender.tab?.id) &&
    isSupportedPage(sender.url);
  const trustedOptionsSender =
    sender.id === chrome.runtime.id &&
    sender.url === chrome.runtime.getURL("options.html");

  if (isQuotaStatusMessage(message)) {
    if (!trustedOptionsSender) {
      sendResponse({ ok: false, error: "Free question counts are available from Settings." } satisfies QuotaStatusResponse);
      return false;
    }
    void (async () => {
      try {
        const installId = await loadInstallId({
          get: (key) => chrome.storage.local.get(key),
          set: (items) => chrome.storage.local.set(items),
        });
        const quota = await requestQuota({ installId, secret: proxyClientSecret() });
        sendResponse({ ok: true, quota } satisfies QuotaStatusResponse);
      } catch {
        sendResponse({ ok: false, error: "Free question counts could not be loaded." } satisfies QuotaStatusResponse);
      }
    })();
    return true;
  }

  if (
    isAddReferenceDocumentMessage(message) ||
    isRemoveReferenceDocumentMessage(message)
  ) {
    if (!trustedOptionsSender) {
      sendResponse({
        ok: false,
        error: "Document library changes must come from Settings.",
      } satisfies ReferenceDocumentsResponse);
      return false;
    }

    const mutation = () =>
      message.type === "ASK_JEV_ADD_REFERENCE_DOCUMENT"
        ? addReferenceDocument(message.document)
        : removeReferenceDocument(message.id);
    void enqueueDocumentMutation(mutation)
      .then((documents) =>
        sendResponse({
          ok: true,
          documents: toReferenceMetadata(documents),
        } satisfies ReferenceDocumentsResponse),
      )
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not update the document library.",
        } satisfies ReferenceDocumentsResponse),
      );
    return true;
  }

  if (isGetReferenceDocumentsMessage(message)) {
    if (!trustedSender) {
      sendResponse({ ok: false, error: "This page is not supported." } satisfies ReferenceDocumentsResponse);
      return false;
    }
    void loadReferenceDocuments()
      .then((documents) =>
        sendResponse({
          ok: true,
          documents: toReferenceMetadata(documents),
        } satisfies ReferenceDocumentsResponse),
      )
      .catch(() =>
        sendResponse({
          ok: false,
          error: "Could not load reference documents.",
        } satisfies ReferenceDocumentsResponse),
      );
    return true;
  }

  const rejectedAsk = rejectionForAskJevMessage(message);
  if (rejectedAsk) {
    sendResponse(rejectedAsk);
    return false;
  }

  if (!isAskJevMessage(message)) return false;

  const respond = (): Promise<AskJevResponse> => askOnce(message.requestId, async () => {
    if (!trustedSender) {
      return { ok: false, code: "bad_request", source: "plugin", error: "This page is not supported." };
    }

    const question = message.payload.question.trim();
    const choices = cleanChoices(message.payload.choices);
    const validationError = validateAskInput(question, choices);
    if (validationError) {
      return { ok: false, code: "bad_request", source: "plugin", error: validationError };
    }
    const referenceIds = new Set(message.payload.referenceDocumentIds);
    const referenceDocuments = (await loadReferenceDocuments()).filter((document) =>
      referenceIds.has(document.id),
    );
    const contextDocuments = [
      ...message.payload.ephemeralDocuments.map((document) => ({
        name: document.name,
        kind: "ephemeral" as const,
        text: document.text,
      })),
      ...referenceDocuments.map((document) => ({
        name: document.name,
        kind: "permanent" as const,
        text: document.text,
      })),
    ];

    if (!message.payload.pageContent.trim() && !contextDocuments.length) {
      return {
        ok: false,
        code: "bad_request",
        source: "plugin",
        error: "No readable page or document text was found.",
      };
    }

    const context = buildJevState({
      pageContent: message.payload.pageContent,
      documents: contextDocuments,
    });
    const stored = await chrome.storage.local.get(["apiKey", "endpoint", "model"]);
    const settings = normalizeSettings(stored);
    const startedAt = performance.now();
    try {
      if (settings.apiKey) {
        const result = await requestJev(
          {
            context,
            question,
            choices,
          },
          settings,
        );
        return {
          ok: true,
          result,
          latencyMs: Math.round(performance.now() - startedAt),
        };
      }
      const installId = await loadInstallId({
        get: (key) => chrome.storage.local.get(key),
        set: (items) => chrome.storage.local.set(items),
      });
      const free = await requestFreeJev(
        { context, question, choices },
        settings,
        { installId, secret: proxyClientSecret() },
      );
      return {
        ok: true,
        result: free.result,
        latencyMs: Math.round(performance.now() - startedAt),
        ...(typeof free.remaining === "number" ? { remaining: free.remaining } : {}),
      };
    } catch (error) {
      if (error instanceof JevRequestError) {
        return {
          ok: false,
          code: error.code,
          source: error.source,
          error: error.message,
          ...(error.quota ? { quota: error.quota } : {}),
        };
      }
      return {
        ok: false,
        code: "network",
        source: "plugin",
        error: "Ask Jev ran into an unexpected error.",
      };
    }
  });

  void respond()
    .then(sendResponse)
    .catch(() =>
      sendResponse({
        ok: false,
        code: "network",
        source: "plugin",
        error: "Ask Jev could not read extension storage.",
      } satisfies AskJevResponse),
    );
  return true;
});
