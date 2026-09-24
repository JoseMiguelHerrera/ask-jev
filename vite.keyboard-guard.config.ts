import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    target: "chrome119",
    emptyOutDir: false,
    minify: "oxc",
    lib: {
      entry: resolve(import.meta.dirname, "src/content/keyboard-guard-entry.ts"),
      name: "AskJevKeyboardGuard",
      formats: ["iife"],
      fileName: () => "assets/keyboard-guard.js",
    },
    rolldownOptions: {
      output: { codeSplitting: false },
    },
  },
});
