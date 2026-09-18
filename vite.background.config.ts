import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    target: "chrome119",
    emptyOutDir: false,
    minify: "oxc",
    lib: {
      entry: resolve(import.meta.dirname, "src/background/index.ts"),
      formats: ["es"],
      fileName: () => "assets/background.js",
    },
    rolldownOptions: {
      output: { codeSplitting: false },
    },
  },
});
