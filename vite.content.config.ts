import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    target: "chrome119",
    emptyOutDir: false,
    minify: "oxc",
    lib: {
      entry: resolve(import.meta.dirname, "src/content/index.tsx"),
      name: "AskJevContent",
      formats: ["iife"],
      fileName: () => "assets/content.js",
    },
    rolldownOptions: {
      transform: {
        define: { "import.meta": "{}" },
      },
      output: { codeSplitting: false },
    },
  },
});
