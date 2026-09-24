import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../dist/${path}`, import.meta.url), "utf8");

const [manifestText, contentScript, keyboardGuard, backgroundScript, optionsHtml, pdfWorker, cMap, icon16, icon48, icon128] = await Promise.all([
  read("manifest.json"),
  read("assets/content.js"),
  read("assets/keyboard-guard.js"),
  read("assets/background.js"),
  read("options.html"),
  read("assets/pdf.worker.min.mjs"),
  read("assets/cmaps/GB-H.bcmap"),
  read("icons/icon-16.png"),
  read("icons/icon-48.png"),
  read("icons/icon-128.png"),
]);

const manifest = JSON.parse(manifestText);
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.service_worker, "assets/background.js");
assert.equal(manifest.background.type, "module");
assert.equal(manifest.minimum_chrome_version, "119");
assert.deepEqual(manifest.content_scripts, [
  {
    matches: ["http://*/*", "https://*/*"],
    js: ["assets/keyboard-guard.js"],
    run_at: "document_start",
  },
]);
assert.deepEqual(manifest.host_permissions, [
  "https://api.typesafe.ai/*",
  "https://ask-jev-backend.vercel.app/*",
]);
assert.doesNotMatch(keyboardGuard, /^\s*import\s/m);
assert.match(keyboardGuard, /stopImmediatePropagation/);
assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "scripting", "storage"]);
assert.match(
  manifest.content_security_policy.extension_pages,
  /connect-src https:\/\/api\.typesafe\.ai https:\/\/ask-jev-backend\.vercel\.app/,
);
assert.equal(manifest.commands["toggle-ask-jev"].suggested_key.default, "Ctrl+Shift+K");
assert.equal(manifest.commands["toggle-ask-jev"].suggested_key.mac, "Command+J");
assert.deepEqual(manifest.web_accessible_resources[0].resources, [
  "assets/pdf.worker.min.mjs",
  "assets/cmaps/*",
]);
assert.ok(pdfWorker.length > 100_000);
assert.ok(cMap.length > 100);
assert.deepEqual(manifest.icons, {
  16: "icons/icon-16.png",
  48: "icons/icon-48.png",
  128: "icons/icon-128.png",
});
assert.equal(manifest.action.default_icon["128"], "icons/icon-128.png");
assert.ok(icon16.length > 100 && icon48.length > 100 && icon128.length > 100);
assert.doesNotMatch(contentScript, /^\s*import\s/m);
assert.doesNotMatch(contentScript, /process\.env\.NODE_ENV/);
assert.doesNotMatch(backgroundScript, /^\s*import\s/m);
assert.match(optionsHtml, /assets\/options\.js/);

const optionsScriptPath = optionsHtml.match(/assets\/options(?:-[^"]+)?\.js/)?.[0];
assert.ok(optionsScriptPath, "options bundle path");
const optionsScript = await read(optionsScriptPath);
assert.match(backgroundScript, /x-ask-jev-signature/);
assert.doesNotMatch(contentScript, /x-ask-jev-signature/);
assert.doesNotMatch(keyboardGuard, /x-ask-jev-signature/);
assert.doesNotMatch(optionsScript, /x-ask-jev-signature/);
assert.doesNotMatch(backgroundScript, /sourceMappingURL/);
const envFile = await readFile(new URL("../.env", import.meta.url), "utf8").catch(() => "");
const envSecret = envFile
  .split("\n")
  .find((entry) => entry.startsWith("VITE_PROXY_CLIENT_SECRET="))
  ?.slice("VITE_PROXY_CLIENT_SECRET=".length)
  .trim()
  .replace(/^["']|["']$/g, "");
const signingSecret = process.env.VITE_PROXY_CLIENT_SECRET?.trim() || envSecret;
if (signingSecret) {
  const secretPattern = new RegExp(signingSecret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  assert.match(backgroundScript, secretPattern);
  assert.doesNotMatch(contentScript, secretPattern);
  assert.doesNotMatch(keyboardGuard, secretPattern);
  assert.doesNotMatch(optionsScript, secretPattern);
}

console.log("Verified MV3 manifest and self-contained extension bundles.");
