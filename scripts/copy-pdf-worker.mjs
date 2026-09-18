import { copyFile, cp, mkdir } from "node:fs/promises";

const assets = new URL("../dist/assets/", import.meta.url);
await mkdir(assets, { recursive: true });
await copyFile(
  new URL("../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url),
  new URL("pdf.worker.min.mjs", assets),
);
await cp(
  new URL("../node_modules/pdfjs-dist/cmaps/", import.meta.url),
  new URL("cmaps/", assets),
  { recursive: true },
);
