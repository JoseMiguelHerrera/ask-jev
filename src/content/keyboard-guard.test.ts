// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  ASK_JEV_HOST_ID,
  askJevKeyHandlers,
  installAskJevKeyboardGuard,
  isAskJevKeyboardEvent,
  preventedTextEditCommand,
} from "./keyboard-guard";

function overlayWithInput(): { host: HTMLElement; input: HTMLInputElement } {
  const host = document.createElement("div");
  host.id = ASK_JEV_HOST_ID;
  const shadow = host.attachShadow({ mode: "closed" });
  const input = document.createElement("input");
  shadow.append(input);
  document.body.append(host);
  return { host, input };
}

describe("isAskJevKeyboardEvent", () => {
  it("matches keys fired inside the overlay and ignores IME composition", () => {
    const { host, input } = overlayWithInput();
    const inside = {
      isComposing: false,
      key: "a",
      composedPath: () => [input, host],
    } as unknown as KeyboardEvent;
    expect(isAskJevKeyboardEvent(inside, host)).toBe(true);
    expect(
      isAskJevKeyboardEvent(
        { isComposing: true, key: "Process", composedPath: () => [input, host] } as unknown as KeyboardEvent,
        host,
      ),
    ).toBe(false);
    host.remove();
  });
});

describe("installAskJevKeyboardGuard", () => {
  it("stops page capture listeners from seeing keys typed in the overlay", () => {
    const { input, host } = overlayWithInput();
    installAskJevKeyboardGuard();
    const page = vi.fn((event: KeyboardEvent) => event.preventDefault());
    const palette = vi.fn();
    window.addEventListener("keydown", page, true);
    askJevKeyHandlers().add(palette);

    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true, composed: true, cancelable: true }));

    expect(page).not.toHaveBeenCalled();
    expect(palette).toHaveBeenCalledOnce();
    window.removeEventListener("keydown", page, true);
    askJevKeyHandlers().delete(palette);
    host.remove();
  });
});

describe("preventedTextEditCommand", () => {
  it("inserts a character the page already cancelled", () => {
    const event = new KeyboardEvent("keydown", { key: "k", cancelable: true });
    event.preventDefault();
    expect(preventedTextEditCommand(event)).toEqual({ command: "insertText", value: "k" });
  });

  it("leaves browser editing alone when the page did not cancel the key", () => {
    expect(preventedTextEditCommand(new KeyboardEvent("keydown", { key: "k", cancelable: true }))).toBeNull();
  });
});
