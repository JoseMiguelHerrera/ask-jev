import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { cleanChoices, MAX_CHOICES, validateAskInput } from "../lib/choices";
import type { ReferenceDocumentMetadata } from "../lib/document-store";
import { parseDocumentFile, type ParsedDocument } from "../lib/documents";
import { presentAskError, type PresentedAskError } from "../lib/ask-error";
import { sendAskJevRequest } from "../lib/ask-rpc";
import type { JevChoiceResult } from "../lib/jev";
import {
  MAX_EPHEMERAL_DOCUMENTS,
  openAskJevSettings,
  type ReferenceDocumentsResponse,
} from "../lib/messages";
import { extractPageContext } from "../lib/page-context";

interface AskJevPaletteProps {
  onClose: () => void;
}

interface CompletedResult {
  judgment: JevChoiceResult;
  latencyMs: number;
}

const INITIAL_CHOICES = ["YES", "NO", "UNCLEAR"];

export function AskJevPalette({ onClose }: AskJevPaletteProps) {
  const [question, setQuestion] = useState("");
  const [choices, setChoices] = useState(INITIAL_CHOICES);
  const [newChoice, setNewChoice] = useState("");
  const [result, setResult] = useState<CompletedResult | null>(null);
  const [error, setError] = useState<PresentedAskError | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsingDocuments, setParsingDocuments] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [ephemeralDocuments, setEphemeralDocuments] = useState<ParsedDocument[]>([]);
  const [referenceDocuments, setReferenceDocuments] = useState<ReferenceDocumentMetadata[]>([]);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const questionRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentOperationRef = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    questionRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("keydown", closeOnEscape, true);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    void chrome.runtime
      .sendMessage({ type: "ASK_JEV_GET_REFERENCE_DOCUMENTS" })
      .then((response: ReferenceDocumentsResponse) => {
        if (response?.ok) setReferenceDocuments(response.documents);
      })
      .catch(() => undefined);
  }, []);

  const resetResponse = () => {
    setResult(null);
    setError(null);
  };

  const updateChoice = (index: number, value: string) => {
    setChoices((current) => current.map((choice, itemIndex) => (itemIndex === index ? value : choice)));
    resetResponse();
  };

  const removeChoice = (index: number) => {
    setChoices((current) => current.filter((_, itemIndex) => itemIndex !== index));
    resetResponse();
  };

  const addChoice = () => {
    const value = newChoice.trim();
    if (!value || choices.length >= MAX_CHOICES) return;
    setChoices((current) => [...current, value]);
    setNewChoice("");
    resetResponse();
  };

  const addDocuments = async (files: File[]) => {
    if (documentOperationRef.current) return;
    const available = MAX_EPHEMERAL_DOCUMENTS - ephemeralDocuments.length;
    if (available <= 0) {
      setDocumentError(`Attach up to ${MAX_EPHEMERAL_DOCUMENTS} documents.`);
      return;
    }
    if (files.length > available) {
      setDocumentError(`Only the first ${available} document${available === 1 ? "" : "s"} fit.`);
    } else {
      setDocumentError("");
    }

    documentOperationRef.current = true;
    setParsingDocuments(true);
    const existingNames = new Set(
      ephemeralDocuments.map((document) => document.name.toLocaleLowerCase()),
    );
    const parsed: ParsedDocument[] = [];
    try {
      for (const file of files.slice(0, available)) {
        if (existingNames.has(file.name.toLocaleLowerCase())) continue;
        try {
          const document = await parseDocumentFile(file);
          parsed.push(document);
          existingNames.add(document.name.toLocaleLowerCase());
        } catch (parseError) {
          setDocumentError(
            parseError instanceof Error ? parseError.message : `Could not read “${file.name}”.`,
          );
        }
      }
      setEphemeralDocuments((current) =>
        [...current, ...parsed].slice(0, MAX_EPHEMERAL_DOCUMENTS),
      );
    } finally {
      documentOperationRef.current = false;
      setParsingDocuments(false);
    }
    resetResponse();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (documentOperationRef.current) return;
    void addDocuments(Array.from(event.dataTransfer.files));
  };

  const toggleReferenceDocument = (id: string) => {
    setSelectedReferenceIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
    resetResponse();
  };

  const handleNewChoiceKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addChoice();
    } else if (event.key === "Backspace" && !newChoice && choices.length) {
      removeChoice(choices.length - 1);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading || parsingDocuments) return;

    const pendingChoices = newChoice.trim() ? [...choices, newChoice] : choices;
    const cleanedChoices = cleanChoices(pendingChoices);
    const validationError = validateAskInput(question, cleanedChoices);
    if (validationError) {
      setError(presentAskError(validationError));
      return;
    }

    const context = extractPageContext({ document });
    if (!context && !ephemeralDocuments.length && !selectedReferenceIds.length) {
      setError(presentAskError("No readable page or document text was found."));
      return;
    }

    setChoices(cleanedChoices);
    setNewChoice("");
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await sendAskJevRequest({
        pageContent: context,
        ephemeralDocuments,
        referenceDocumentIds: selectedReferenceIds,
        question: question.trim(),
        choices: cleanedChoices,
      });

      if (response.ok) {
        setResult({ judgment: response.result, latencyMs: response.latencyMs });
      } else {
        setError(presentAskError(response));
      }
    } catch {
      setError(presentAskError("The extension connection was interrupted. Try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ajev-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={panelRef}
        className="ajev-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Ask Jev"
      >
        <header className="ajev-header">
          <div className="ajev-brand">
            <span className="ajev-mark" aria-hidden="true">∵</span>
            <span>Ask Jev</span>
            <span className="ajev-context-label">
              {window.getSelection()?.toString().trim() ? "Selection" : "Current page"}
            </span>
          </div>
          <div className="ajev-header-actions">
            <button
              className="ajev-icon-button"
              type="button"
              onClick={() => void openAskJevSettings()}
              aria-label="Open settings"
            >
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M6.4 1.2h3.2l.3 1.5a4.8 4.8 0 0 1 1.4.8l1.4-.6 1.6 2.8-1.2 1c.1.4.1.8.1 1.2s0 .8-.1 1.2l1.2 1-1.6 2.8-1.4-.6a4.8 4.8 0 0 1-1.4.8l-.3 1.5H6.4l-.3-1.5a4.8 4.8 0 0 1-1.4-.8l-1.4.6L1.7 10l1.2-1A5 5 0 0 1 2.8 8c0-.4 0-.8.1-1.2l-1.2-1 1.6-2.8 1.4.6a4.8 4.8 0 0 1 1.4-.8ZM8 10.1A2.1 2.1 0 1 0 8 5.9a2.1 2.1 0 0 0 0 4.2Z"
                />
              </svg>
            </button>
            <button className="ajev-icon-button" type="button" onClick={onClose} aria-label="Close">
              <span aria-hidden="true">Esc</span>
            </button>
          </div>
        </header>

        <form onSubmit={submit}>
          <label className="ajev-field-label" htmlFor="ajev-question">
            Question
          </label>
          <input
            ref={questionRef}
            id="ajev-question"
            className="ajev-question"
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
              resetResponse();
            }}
            placeholder="What do you want to know about this page?"
            autoComplete="off"
            maxLength={500}
          />

          <div
            className={`ajev-drop-zone${dragging ? " is-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragging(false);
              }
            }}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              className="ajev-file-input"
              type="file"
              accept=".txt,.md,.markdown,.json,.csv,.pdf"
              multiple
              disabled={parsingDocuments}
              onChange={(event) => {
                void addDocuments(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={parsingDocuments}
              onClick={() => fileInputRef.current?.click()}
            >
              <span aria-hidden="true">＋</span>
              {parsingDocuments ? "Reading documents…" : "Drop documents or browse"}
            </button>
            <small>TXT, Markdown, JSON, CSV, PDF · 5 MB max</small>
          </div>

          {ephemeralDocuments.length > 0 && (
            <div className="ajev-document-chips" aria-label="Attached documents">
              {ephemeralDocuments.map((document) => (
                <div className="ajev-document-chip" key={document.id}>
                  <span aria-hidden="true">↳</span>
                  <span title={document.name}>{document.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${document.name}`}
                    onClick={() => {
                      setEphemeralDocuments((current) =>
                        current.filter((item) => item.id !== document.id),
                      );
                      resetResponse();
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="ajev-reference-heading">
            <span className="ajev-field-label">Reference documents</span>
            <button type="button" onClick={() => void openAskJevSettings()}>
              Manage
            </button>
          </div>
          {referenceDocuments.length ? (
            <div className="ajev-reference-list" aria-label="Permanent reference documents">
              {referenceDocuments.map((document) => {
                const selected = selectedReferenceIds.includes(document.id);
                return (
                  <button
                    type="button"
                    className={selected ? "is-selected" : ""}
                    aria-pressed={selected}
                    key={document.id}
                    onClick={() => toggleReferenceDocument(document.id)}
                  >
                    <span className="ajev-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                    <span title={document.name}>{document.name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="ajev-empty-references">No permanent documents saved.</p>
          )}

          {documentError && <div className="ajev-document-error" role="alert">{documentError}</div>}

          <div className="ajev-answers-heading">
            <span className="ajev-field-label">Possible answers</span>
            <span className="ajev-helper">Jev assigns a probability to each</span>
          </div>
          <div className="ajev-choice-list" aria-label="Possible answers">
            {choices.map((choice, index) => (
              <div className="ajev-choice" key={index}>
                <input
                  value={choice}
                  aria-label={`Answer ${index + 1}`}
                  maxLength={80}
                  onChange={(event) => updateChoice(index, event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeChoice(index)}
                  aria-label={`Remove ${choice || `answer ${index + 1}`}`}
                >
                  ×
                </button>
              </div>
            ))}
            {choices.length < MAX_CHOICES && (
              <div className="ajev-choice aje-add-choice">
                <input
                  value={newChoice}
                  onChange={(event) => setNewChoice(event.target.value)}
                  onKeyDown={handleNewChoiceKeyDown}
                  onBlur={addChoice}
                  placeholder="+ Add answer"
                  aria-label="Add another answer"
                  maxLength={80}
                />
              </div>
            )}
          </div>

          {loading && (
            <div className="ajev-loading" role="status">
              <span />
              <span />
              <span />
              <em>Jev is judging the page</em>
            </div>
          )}

          {result && (
            <div className="ajev-results" aria-live="polite">
              {result.judgment.probabilities.map(({ label, probability }) => {
                const percent = Math.round(probability * 100);
                const selected = label === result.judgment.selected;
                return (
                  <div className={`ajev-result-row${selected ? " is-selected" : ""}`} key={label}>
                    <div className="ajev-result-meta">
                      <span>{label}</span>
                      <strong>{percent}%</strong>
                    </div>
                    <div className="ajev-track">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="ajev-result-footer">
                <span>Jev</span>
                <span className="ajev-dot">·</span>
                <span>{result.latencyMs}ms</span>
              </div>
            </div>
          )}

          {error && (
            <div className={`ajev-error${error.source === "jev" ? " is-jev" : ""}`} role="alert">
              <div>
                <strong>{error.label}</strong>
                <span>{error.message}</span>
                {error.attribution ? <small>{error.attribution}</small> : null}
              </div>
              {error.message.toLowerCase().includes("api key") && (
                <button type="button" onClick={() => void openAskJevSettings()}>
                  Open settings
                </button>
              )}
            </div>
          )}

          <footer className="ajev-footer">
            <span>
              <kbd>Enter</kbd> ask
            </span>
            <button className="ajev-submit" type="submit" disabled={loading || parsingDocuments}>
              {loading ? "Asking…" : parsingDocuments ? "Reading…" : "Ask Jev"}
              <span aria-hidden="true">↵</span>
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
