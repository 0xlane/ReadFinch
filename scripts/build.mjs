import { build } from "esbuild";
import { build as viteBuild } from "vite";
import "./build-native.mjs";
import "./icon.mjs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const manifest = JSON.parse(await readFile("assets/ocr/manifest.json", "utf8"));
for (const lang of ["eng", "chi_sim"]) {
  const bytes = await readFile(`assets/ocr/${lang}.traineddata`);
  if (
    createHash("sha256").update(bytes).digest("hex") !== manifest.sha256[lang]
  )
    throw Error(`Bundled OCR asset is missing or damaged: ${lang}`);
}
await build({
  entryPoints: ["src/main/main.ts", "src/main/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outdir: "dist/main",
  outExtension: { ".js": ".cjs" },
  external: [
    "electron",
    "tesseract.js",
    "electron-updater",
    "electron-updater/*",
    "builder-util-runtime",
  ],
  sourcemap: true,
});
await viteBuild();
