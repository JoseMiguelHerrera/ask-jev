import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AskJevPalette } from "../components/AskJevPalette";
import paletteStyles from "./palette.css?inline";

const HOST_ID = "ask-jev-extension-root";
let root: Root | null = null;

function closePalette(): void {
  root?.unmount();
  root = null;
  document.getElementById(HOST_ID)?.remove();
}

function openPalette(): void {
  closePalette();

  const host = document.createElement("ask-jev-overlay");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = paletteStyles;
  const mount = document.createElement("div");
  shadow.append(style, mount);
  document.documentElement.append(host);

  root = createRoot(mount);
  root.render(
    <StrictMode>
      <AskJevPalette onClose={closePalette} />
    </StrictMode>,
  );
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "ASK_JEV_TOGGLE"
  ) {
    if (document.getElementById(HOST_ID)) closePalette();
    else openPalette();
  }
});
