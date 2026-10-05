# Ask Jev

A keyboard-first Chrome extension for asking probabilistic questions about the current webpage with TypeSafe's Jev model.

**[Install Ask Jev from the Chrome Web Store](https://chromewebstore.google.com/detail/ask-jev/hhoafjjgfhcbiobmmgmaoonllkgmdmgj)**

## Configure Jev

A personal TypeSafe key is never included in the build. Leave the key blank to use this install's free questions each UTC day. Those questions go through the Ask Jev proxy. Settings shows how many are left. A saved key is unlimited and is sent only to `https://api.typesafe.ai`.

1. Build and load the extension using the instructions below.
2. Chrome opens the Ask Jev options page after installation. You can also open `chrome://extensions`, select **Ask Jev**, and choose **Extension options**.
3. To use your own key, copy the key already available in your shell:

   ```sh
   source ~/.zshrc
   printf %s "$TYPESAFE_API_KEY" | pbcopy
   ```

4. Paste it into **TypeSafe API key** and select **Save settings**. Saving a blank key keeps the free tier.
5. Leave the endpoint as `https://api.typesafe.ai/v1/systemone` and the model as `jev-latest` unless TypeSafe instructs you to use another model.

The key is stored in `chrome.storage.local`. Storage access is restricted to trusted extension contexts; the options page can display it, while only the background service worker transmits it to TypeSafe.

Free questions need a signing secret compiled into the background service worker. Copy `PROXY_CLIENT_SECRET` from the backend into a gitignored `.env` in this folder as `VITE_PROXY_CLIENT_SECRET`, then build. Do not commit that file. The verify step fails the build if that secret appears in the content script or options page. `VITE_ASK_JEV_PROXY_URL` is optional and defaults to `https://ask-jev-backend.vercel.app`.

An unpacked build calls the proxy with `Origin: chrome-extension://<this extension id>`. Add that id to the proxy `ALLOWED_EXTENSION_IDS` value (comma-separated, no brackets) and redeploy before free questions will be accepted.

## Build

Requires a current Node.js installation and Chrome 119 or newer.

```sh
npm install
npm test
npm run build
```

The unpacked extension is generated in `dist/`.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project's `dist` directory.
5. This version adds permission to contact `https://ask-jev-backend.vercel.app`. After an update, Chrome disables the extension until you approve that host on `chrome://extensions`.
6. Open a normal `http://` or `https://` webpage.
7. Press `Command+J` on macOS or `Ctrl+Shift+K` on Windows/Linux.

Chrome reserves `Command+Shift+J` for Downloads on macOS and `Ctrl+Shift+J` for DevTools on other platforms. If the command is unassigned, open `chrome://extensions/shortcuts` and assign your preferred shortcut to **Open Ask Jev on the current page**. Clicking the Ask Jev toolbar icon is always available as a fallback.

## Use

1. Enter a question about the page.
2. Optionally drag up to three TXT, Markdown, JSON, CSV, or PDF documents into the palette.
3. Optionally select relevant permanent documents from **Reference documents**. Add or remove permanent documents from Extension options.
4. Edit the default `YES`, `NO`, and `UNCLEAR` answer chips or add your own possible answers.
5. Press Enter or select **Ask Jev**.

Selected page text is used first. Otherwise, Ask Jev extracts visible readable text, excludes common page chrome, and truncates it conservatively before calling Jev's native Choice API.

Documents are parsed locally. Ephemeral documents disappear when the palette closes; permanent documents store extracted text in `chrome.storage.local`. Raw files are never uploaded. Only text from documents selected for the current question is sent, either to TypeSafe with a saved key or through the proxy on the free tier.

## Important files

- `src/content/index.tsx` mounts the isolated Shadow DOM overlay, while `src/components/AskJevPalette.tsx` implements its interaction and result UI.
- `src/lib/page-context.ts` extracts selected or readable page text; `src/lib/jev.ts` constructs and validates native Jev Choice requests.
- `src/lib/documents.ts`, `src/lib/document-store.ts`, and `src/lib/context-state.ts` parse documents, manage permanent references, and fairly allocate Jev's context budget.
- `src/background/index.ts` validates messages, reads protected settings, and is the only code that calls TypeSafe or the free-question proxy. `src/lib/proxy.ts` signs free requests.
- `src/options/OptionsApp.tsx` stores the API key, endpoint, and model.

## Scope

The extension remains text-only and requires user-supplied answer choices. Later roadmap work may add opt-in image-to-text context and editable, automatically proposed answer choices using separate providers.

References: [Chrome extension security](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure), [Chrome service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [TypeSafe API](https://docs.typesafe.ai/api.md), and [Jev models](https://docs.typesafe.ai/models.md).
