import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OptionsApp } from "./OptionsApp";
import "./options.css";

void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

const root = document.getElementById("root");
if (!root) throw new Error("Options root was not found.");

createRoot(root).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
);
