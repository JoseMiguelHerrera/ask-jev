import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  loadReferenceDocuments,
  MAX_REFERENCE_DOCUMENTS,
  toReferenceMetadata,
  type ReferenceDocumentMetadata,
} from "../lib/document-store";
import { parseDocumentFile } from "../lib/documents";
import type { ReferenceDocumentsResponse } from "../lib/messages";
import { burstSecondsLeft } from "../lib/ask-error";
import type { QuotaStatusResponse } from "../lib/messages";
import { formatReset, quotaRows, type QuotaSnapshot } from "../lib/quota-status";
import { DEFAULT_SETTINGS, normalizeSettings } from "../lib/settings";

export function OptionsApp() {
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState(DEFAULT_SETTINGS.endpoint);
  const [model, setModel] = useState(DEFAULT_SETTINGS.model);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState("");
  const [documents, setDocuments] = useState<ReferenceDocumentMetadata[]>([]);
  const [documentStatus, setDocumentStatus] = useState("");
  const [parsingDocuments, setParsingDocuments] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [quotaState, setQuotaState] = useState<"loading" | "ready" | "error">("loading");
  const [now, setNow] = useState(() => Date.now());
  const quotaReceivedAt = useRef(Date.now());
  const [shortcut, setShortcut] = useState<string | null>(null);
  const [shortcutsLinkCopied, setShortcutsLinkCopied] = useState(false);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const apiKeyRef = useRef<HTMLInputElement>(null);

  const copyShortcutsLink = async () => {
    try {
      await navigator.clipboard.writeText("chrome://extensions/shortcuts");
      setShortcutsLinkCopied(true);
      setTimeout(() => setShortcutsLinkCopied(false), 2500);
    } catch {
      setShortcutsLinkCopied(false);
    }
  };

  const shortcutsLink = (
    <button type="button" className="shortcuts-link" onClick={() => void copyShortcutsLink()}>
      chrome://extensions/shortcuts
    </button>
  );

  useEffect(() => {
    void chrome.storage.local.get(["apiKey", "endpoint", "model"]).then((stored) => {
      const settings = normalizeSettings(stored);
      setApiKey(settings.apiKey);
      setEndpoint(settings.endpoint);
      setModel(settings.model);
      setSettingsLoaded(true);
    });
    void loadReferenceDocuments().then((stored) =>
      setDocuments(toReferenceMetadata(stored)),
    );

    const refreshShortcut = () => {
      void chrome.commands.getAll().then((commands) => {
        const toggle = commands.find((command) => command.name === "toggle-ask-jev");
        setShortcut(toggle?.shortcut ?? "");
      });
    };
    refreshShortcut();
    window.addEventListener("focus", refreshShortcut);

    const focusApiKey = () => {
      const field = apiKeyRef.current;
      if (!field) return;
      field.focus();
      field.scrollIntoView({ block: "center" });
    };
    const consumeApiKeyIntent = () => {
      void chrome.storage.local.get("settingsIntent").then((stored) => {
        if (stored.settingsIntent !== "apiKey") return;
        focusApiKey();
        void chrome.storage.local.remove("settingsIntent");
      });
    };
    consumeApiKeyIntent();
    const onStorageChanged = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === "local" && changes.settingsIntent?.newValue === "apiKey") consumeApiKeyIntent();
    };
    chrome.storage.onChanged.addListener(onStorageChanged);

    return () => {
      window.removeEventListener("focus", refreshShortcut);
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  const loadQuota = () => {
    setQuota(null);
    setQuotaState("loading");
    void chrome.runtime.sendMessage({ type: "ASK_JEV_QUOTA" })
      .then((response: QuotaStatusResponse) => {
        if (!response?.ok) {
          setQuotaState("error");
          return;
        }
        quotaReceivedAt.current = Date.now();
        setNow(Date.now());
        setQuota(response.quota);
        setQuotaState("ready");
      })
      .catch(() => setQuotaState("error"));
  };

  useEffect(() => {
    if (!settingsLoaded || apiKey.trim()) return;
    loadQuota();
  }, [settingsLoaded, apiKey]);

  useEffect(() => {
    const retry = quota?.burst?.retryAfterSeconds;
    if (quotaState !== "ready" || typeof retry !== "number") return;
    const endsAt = quotaReceivedAt.current + retry * 1000;
    if (Date.now() >= endsAt) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) {
        window.clearInterval(timer);
        loadQuota();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [quota, quotaState]);

  const addDocuments = async (files: File[]) => {
    const available = MAX_REFERENCE_DOCUMENTS - documents.length;
    if (available <= 0) {
      setDocumentStatus(`The library supports up to ${MAX_REFERENCE_DOCUMENTS} documents.`);
      return;
    }

    setParsingDocuments(true);
    setDocumentStatus("");
    for (const file of files.slice(0, available)) {
      try {
        const parsed = await parseDocumentFile(file);
        const response = (await chrome.runtime.sendMessage({
          type: "ASK_JEV_ADD_REFERENCE_DOCUMENT",
          document: parsed,
        })) as ReferenceDocumentsResponse;
        if (!response.ok) throw new Error(response.error);
        setDocuments(response.documents);
      } catch (error) {
        setDocumentStatus(
          error instanceof Error ? error.message : `Could not add “${file.name}”.`,
        );
      }
    }
    if (files.length > available) {
      setDocumentStatus(`Only the first ${available} documents fit in the library.`);
    }
    setParsingDocuments(false);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");

    if (apiKey.trim()) {
      if (endpoint.trim() !== DEFAULT_SETTINGS.endpoint) {
        setStatus("Use the official TypeSafe System One endpoint.");
        return;
      }
      if (!model.trim()) {
        setStatus("Enter a Jev model identifier.");
        return;
      }
    }

    await chrome.storage.local.set(
      normalizeSettings({ apiKey, endpoint, model }),
    );
    setStatus("Settings saved.");
  };

  return (
    <main>
      <section className="settings-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">∵</span>
          <span>Ask Jev</span>
        </div>
        <h1>Connect to Jev</h1>
        <p className="intro">
          Leave the key blank to use this install's free questions each UTC day. A saved key is unlimited and is sent only to TypeSafe.
        </p>

        <form onSubmit={save}>
          <label htmlFor="api-key">TypeSafe API key</label>
          <div className="key-field">
            <input
              ref={apiKeyRef}
              id="api-key"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Optional — blank uses free questions"
              spellCheck={false}
              autoComplete="off"
            />
            <button type="button" onClick={() => setShowKey((visible) => !visible)}>
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <p className="field-note">
            A blank key uses the free tier. A saved key is unlimited and goes only to TypeSafe.
          </p>
          {apiKey.trim() ? (
            <p className="field-note">This key does not use the free caps.</p>
          ) : (
            <div className="quota-status">
              <h2>Free questions</h2>
              {quotaState === "loading" ? <p>Checking free questions…</p> : null}
              {quotaState === "error" ? <p>Free question counts could not be loaded.</p> : null}
              {quotaState === "ready" && quota ? (
                <>
                  <ul>
                    {quotaRows(quota).map((row) => (
                      <li key={row.id}>
                        <span>{row.label}</span>
                        <strong>
                          {row.id === "burst" && typeof quota.burst?.retryAfterSeconds === "number"
                            ? `${row.text}. Wait ${burstSecondsLeft(quota.burst.retryAfterSeconds, quotaReceivedAt.current, now)}s`
                            : row.text}
                        </strong>
                      </li>
                    ))}
                  </ul>
                  {formatReset(quota.resetsAt) ? <p>{formatReset(quota.resetsAt)}</p> : null}
                </>
              ) : null}
            </div>
          )}

          {apiKey.trim() ? (
            <>
              <label htmlFor="endpoint">API endpoint</label>
              <input
                id="endpoint"
                type="url"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                spellCheck={false}
              />

              <label htmlFor="model">Model</label>
              <input
                id="model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="jev-latest"
                spellCheck={false}
              />
            </>
          ) : null}

          <div className="actions">
            <span className={status === "Settings saved." ? "status success" : "status"}>
              {status}
            </span>
            <button className="save-button" type="submit">
              Save settings
            </button>
          </div>
        </form>

        <section className="document-library">
          <div className="section-heading">
            <div>
              <h2>Permanent documents</h2>
              <p>Select saved references from the Ask Jev palette when they are relevant.</p>
            </div>
            <input
              ref={documentInputRef}
              className="hidden-input"
              type="file"
              accept=".txt,.md,.markdown,.json,.csv,.pdf"
              multiple
              onChange={(event) => {
                void addDocuments(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <button
              className="add-document-button"
              type="button"
              disabled={parsingDocuments}
              onClick={() => documentInputRef.current?.click()}
            >
              {parsingDocuments ? "Reading…" : "Add documents"}
            </button>
          </div>

          {documents.length ? (
            <div className="document-list">
              {documents.map((document) => (
                <div className="document-row" key={document.id}>
                  <span className="document-icon" aria-hidden="true">↳</span>
                  <div>
                    <strong>{document.name}</strong>
                    <small>{Math.max(1, Math.round(document.size / 1024))} KB</small>
                  </div>
                  <button
                    type="button"
                    disabled={parsingDocuments}
                    onClick={() => {
                      setParsingDocuments(true);
                      setDocumentStatus("");
                      void chrome.runtime
                        .sendMessage({
                          type: "ASK_JEV_REMOVE_REFERENCE_DOCUMENT",
                          id: document.id,
                        })
                        .then((response: ReferenceDocumentsResponse) => {
                          if (!response.ok) throw new Error(response.error);
                          setDocuments(response.documents);
                        })
                        .catch((error: unknown) =>
                          setDocumentStatus(
                            error instanceof Error
                              ? error.message
                              : "Could not remove the document.",
                          ),
                        )
                        .finally(() => setParsingDocuments(false));
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-library">No permanent documents yet.</div>
          )}
          {documentStatus && <p className="document-status">{documentStatus}</p>}
          <p className="library-note">
            TXT, Markdown, JSON, CSV, and PDF · 5 MB per file · {documents.length}/
            {MAX_REFERENCE_DOCUMENTS} stored
          </p>
        </section>

        {shortcut === "" && (
          <p className="shortcut-warning" role="status">
            Chrome did not assign the keyboard shortcut automatically. Open{" "}
            {shortcutsLink} and set one for{" "}
            <strong>Open Ask Jev on the current page</strong> — the toolbar icon
            works in the meantime.
            {shortcutsLinkCopied && (
              <span className="copied-note"> Copied — paste it into a new tab.</span>
            )}
          </p>
        )}

        <footer>
          {shortcut ? (
            <>
              Open Ask Jev with <kbd>{shortcut}</kbd>.
            </>
          ) : (
            <>
              Open Ask Jev with the toolbar icon until a shortcut is assigned.
            </>
          )}{" "}
          Shortcut conflicts can be changed in {shortcutsLink}.
          {shortcutsLinkCopied && shortcut !== "" && (
            <span className="copied-note"> Copied — paste it into a new tab.</span>
          )}
        </footer>
      </section>
    </main>
  );
}
