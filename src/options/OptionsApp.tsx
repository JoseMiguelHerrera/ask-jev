import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  loadReferenceDocuments,
  MAX_REFERENCE_DOCUMENTS,
  toReferenceMetadata,
  type ReferenceDocumentMetadata,
} from "../lib/document-store";
import { parseDocumentFile } from "../lib/documents";
import type { ReferenceDocumentsResponse } from "../lib/messages";
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
  const [shortcut, setShortcut] = useState<string | null>(null);
  const [shortcutsLinkCopied, setShortcutsLinkCopied] = useState(false);
  const documentInputRef = useRef<HTMLInputElement>(null);

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
    return () => window.removeEventListener("focus", refreshShortcut);
  }, []);

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

    if (!apiKey.trim()) {
      setStatus("Enter your TypeSafe API key.");
      return;
    }
    if (endpoint.trim() !== DEFAULT_SETTINGS.endpoint) {
      setStatus("Use the official TypeSafe System One endpoint.");
      return;
    }
    if (!model.trim()) {
      setStatus("Enter a Jev model identifier.");
      return;
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
          Your key stays in this Chrome profile. Only the extension service worker sends it to TypeSafe.
        </p>

        <form onSubmit={save}>
          <label htmlFor="api-key">TypeSafe API key</label>
          <div className="key-field">
            <input
              id="api-key"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Paste TYPESAFE_API_KEY"
              spellCheck={false}
              autoComplete="off"
            />
            <button type="button" onClick={() => setShowKey((visible) => !visible)}>
              {showKey ? "Hide" : "Show"}
            </button>
          </div>

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
