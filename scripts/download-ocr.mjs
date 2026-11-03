import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function prepareOcrAssets(
  directory = "assets/ocr",
  fetchAsset = fetch,
  retryDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, "manifest.json"), "utf8"),
  );
  if (
    manifest.source !== "tesseract-ocr/tessdata_fast" ||
    !/^[\w.-]+$/.test(manifest.revision)
  )
    throw Error("Invalid OCR asset manifest");
  await mkdir(directory, { recursive: true });
  for (const lang of ["eng", "chi_sim"]) {
    const expected = manifest.sha256[lang];
    if (!/^[a-f0-9]{64}$/.test(expected))
      throw Error(`Missing pinned OCR checksum: ${lang}`);
    const file = path.join(directory, `${lang}.traineddata`);
    const existing = await readFile(file).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    if (existing && sha256(existing) === expected) {
      console.log(`${lang}: verified cached asset`);
      continue;
    }
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetchAsset(
          `https://raw.githubusercontent.com/${manifest.source}/${manifest.revision}/${lang}.traineddata`,
          { signal: AbortSignal.timeout(30000) },
        );
        if (!res.ok) throw Error(`HTTP ${res.status}`);
        const bytes = Buffer.from(await res.arrayBuffer());
        if (sha256(bytes) !== expected)
          throw Error(`OCR asset checksum mismatch: ${lang}`);
        await writeFile(file + ".download", bytes);
        await rename(file + ".download", file);
        console.log(`${lang}: downloaded and verified ${bytes.length} bytes`);
        break;
      } catch (error) {
        if (attempt >= 3)
          throw new Error(`Could not prepare OCR asset ${lang}`, {
            cause: error,
          });
        await retryDelay(1000 * attempt);
      }
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await prepareOcrAssets();
