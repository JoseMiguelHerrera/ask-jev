# Privacy Policy — Ask Jev

Last updated: September 18, 2026

Ask Jev is a Chrome extension that sends text from the page you are viewing to TypeSafe AI's Jev model so it can answer a question you ask. This policy describes exactly what data the extension handles, where it goes, and what never leaves your browser.

## What the extension collects

**Page text.** When you ask a question, the extension extracts your current text selection, or visible readable text from the page if nothing is selected. Text is truncated to a fixed budget before it is sent.

**Documents you attach.** Files you drop into the palette (TXT, Markdown, JSON, CSV, or PDF) are parsed locally in your browser. Only the extracted text of documents you attach to a question is sent with that question. Raw files are never uploaded. Ephemeral attachments are discarded when the palette closes.

**Reference documents.** Documents you save in Settings are stored as extracted text in `chrome.storage.local` on your device. Their text is sent to TypeSafe only when you select them for a specific question.

**Your API key.** Your TypeSafe API key is stored in `chrome.storage.local` with access restricted to trusted extension contexts. It is never embedded in the extension build, never sent to any server other than `api.typesafe.ai`, and is never visible to web pages.

## What is sent to TypeSafe

When you submit a question, the extension's background service worker makes one request to `https://api.typesafe.ai/v1/systemone` containing:

- Your question and the answer choices you wrote
- The extracted page or selection text
- Text from any documents you attached or selected
- Your API key, in the `Authorization` header

TypeSafe processes this data to return an answer. TypeSafe's own privacy policy governs how it handles that data: https://typesafe.ai

## What the extension does not do

- No analytics, tracking, or telemetry
- No advertising, and no sale or sharing of data with third parties
- No browsing history collection — page text is read only when you explicitly ask a question
- No account, sign-in, or personal profile
- No data is sent anywhere other than TypeSafe's API
- No images, cookies, or page credentials are accessed or transmitted

## Data retention

The extension keeps only what you save in Settings: your API key, endpoint, model, and reference documents. All of it stays in `chrome.storage.local` on your device. Uninstalling the extension deletes it. Questions, answers, and ephemeral documents are not persisted.

## Permissions

- `activeTab` and `scripting` — inject the palette into the current tab only when you press the shortcut or click the toolbar icon
- `storage` — store your settings and reference documents locally
- `https://api.typesafe.ai/*` — send questions to the Jev API

## Changes

If this policy changes, the updated version will be posted at this location with a new date.

## Contact

Questions about this policy: open an issue on the project repository.
