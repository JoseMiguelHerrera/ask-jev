export const ASK_JEV_HOST_ID = "ask-jev-extension-root";

const HANDLERS_KEY = "__askJevKeyHandlers";
const GUARD_KEY = "__askJevKeyboardGuard";

export type AskJevKeyHandler = (event: KeyboardEvent) => void;

interface AskJevKeyboardScope {
  [HANDLERS_KEY]?: Set<AskJevKeyHandler>;
  [GUARD_KEY]?: boolean;
}

function scope(): AskJevKeyboardScope {
  return globalThis as AskJevKeyboardScope;
}

export function askJevKeyHandlers(): Set<AskJevKeyHandler> {
  const current = scope();
  current[HANDLERS_KEY] ??= new Set();
  return current[HANDLERS_KEY];
}

export function isAskJevKeyboardEvent(event: KeyboardEvent, host: EventTarget | null): boolean {
  if (!host || event.isComposing || event.key === "Process") return false;
  return event.composedPath().includes(host);
}

/**
 * Pages bind shortcuts on window during the capture phase and ignore the event
 * only when its target is a real input. Events from inside the closed shadow
 * root are retargeted to the overlay, so the page steals them and calls
 * preventDefault before the field can accept text.
 *
 * This listener has to be registered at document_start, before page scripts,
 * and stopImmediatePropagation so those shortcuts never run. The browser still
 * applies the key's default action, which is what types into the field.
 */
export function installAskJevKeyboardGuard(): void {
  const current = scope();
  if (current[GUARD_KEY]) return;
  current[GUARD_KEY] = true;

  const block = (event: KeyboardEvent) => {
    const host = document.getElementById(ASK_JEV_HOST_ID);
    if (!isAskJevKeyboardEvent(event, host)) return;
    event.stopImmediatePropagation();
    if (event.type !== "keydown") return;
    for (const handler of [...askJevKeyHandlers()]) handler(event);
  };

  window.addEventListener("keydown", block, true);
  window.addEventListener("keyup", block, true);
  window.addEventListener("keypress", block, true);
}

export function preventedTextEditCommand(
  event: KeyboardEvent,
): { command: string; value?: string } | null {
  if (!event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.key === "Backspace") return { command: "delete" };
  if (event.key === "Delete") return { command: "forwardDelete" };
  if (event.key.length === 1) return { command: "insertText", value: event.key };
  return null;
}

export function repairPreventedTextEdit(event: KeyboardEvent): void {
  const edit = preventedTextEditCommand(event);
  if (!edit || typeof document.execCommand !== "function") return;
  if (edit.value === undefined) document.execCommand(edit.command);
  else document.execCommand(edit.command, false, edit.value);
}
