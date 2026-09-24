# Privacy Policy — Ask Jev

Last updated: September 22, 2026

Ask Jev is a Chrome extension that sends text from the page you are viewing to TypeSafe AI's Jev model so it can answer a question you ask. This policy describes exactly what data the extension handles, where it goes, and what never leaves your browser.

## What the extension collects

**Page text.** When you ask a question, the extension extracts your current text selection, or visible readable text from the page if nothing is selected. Text is truncated to a fixed budget before it is sent.

**Documents you attach.** Files you drop into the palette (TXT, Markdown, JSON, CSV, or PDF) are parsed locally in your browser. Only the extracted text of documents you attach to a question is sent with that question. Raw files are never uploaded. Ephemeral attachments are discarded when the palette closes.

**Reference documents.** Documents you save in Settings are stored as extracted text in `chrome.storage.local` on your device. Their text is sent to TypeSafe only when you select them for a specific question.

**Your API key.** A personal TypeSafe API key is optional. When you save one, it is stored in `chrome.storage.local` with access restricted to trusted extension contexts. It is never embedded in the extension build, never sent to any server other than `api.typesafe.ai`, and is never visible to web pages. It is never sent to the Ask Jev proxy.

**Install id.** The first time you ask a free question, or open Settings with a blank key, the extension creates a random id and stores it in `chrome.storage.local`. That id is sent only on the free path so the daily allowance can be counted. Opening Settings with a blank key also sends that id to the proxy to read how many free questions are left. No question or page text is included. It is not a TypeSafe account and it is not sent when you use your own key.

## What is sent to TypeSafe

When you submit a question with a saved API key, the extension's background service worker makes one request to `https://api.typesafe.ai/v1/systemone` containing:

- Your question and the answer choices you wrote
- The extracted page or selection text
- Text from any documents you attached or selected
- Your API key, in the `Authorization` header

TypeSafe processes this data to return an answer. TypeSafe's own privacy policy governs how it handles that data: https://typesafe.ai

## Free questions

When the API key is blank, the same question, choices, page text, and selected document text are sent to `https://ask-jev-backend.vercel.app`, along with the random install id. The proxy forwards the question to TypeSafe with a key that stays on the server. The proxy does not store the question, choices, or page text. A saved personal key never takes this path.

## What the extension does not do

- No advertising, and no sale of data
- No browsing history collection — page text is read only when you explicitly ask a question
- No account, sign-in, or personal profile
- No images, cookies, or page credentials are accessed or transmitted
- A personal API key is sent only to TypeSafe

The proxy keeps daily counters and aggregate usage counts (request totals, token estimates, and latency buckets). It does not keep the text of your questions.

## Data retention

The extension keeps only what you save in Settings: your API key (if you set one), endpoint, model, reference documents, and the random install id created for free questions. All of it stays in `chrome.storage.local` on your device. Uninstalling the extension deletes it. Questions, answers, and ephemeral documents are not persisted on the device.

## Permissions

- A small script runs on web pages before the page loads. It does not read page content. Its only job is to keep keystrokes inside the Ask Jev palette from being treated as shortcuts by the page underneath. Page text is still read only when you ask a question.
- `activeTab` and `scripting` — inject the palette into the current tab only when you press the shortcut or click the toolbar icon
- `storage` — store your settings and reference documents locally
- `https://api.typesafe.ai/*` — send questions to the Jev API when you have saved your own key
- `https://ask-jev-backend.vercel.app/*` — send free questions when no personal key is saved

## Changes

If this policy changes, the updated version will be posted at this location with a new date.

## Contact

Questions about this policy: open an issue on the project repository.
