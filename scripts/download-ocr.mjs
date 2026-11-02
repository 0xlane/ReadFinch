import { mkdir, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
await mkdir("assets/ocr", { recursive: true });
const hashes = {};
for (const lang of ["eng", "chi_sim"]) {
  const res = await fetch(
    `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/${lang}.traineddata`,
  );
  if (!res.ok) throw Error(`Download failed: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (
    bytes.length < 100000 ||
    bytes.readInt32LE(0) < 16 ||
    bytes.readInt32LE(0) > 256
  )
    throw Error("Invalid traineddata");
  await writeFile(`assets/ocr/${lang}.traineddata.download`, bytes);
  await rename(
    `assets/ocr/${lang}.traineddata.download`,
    `assets/ocr/${lang}.traineddata`,
  );
  hashes[lang] = createHash("sha256").update(bytes).digest("hex");
  console.log(`${lang}: ${bytes.length} bytes, sha256 ${hashes[lang]}`);
}
await writeFile(
  "assets/ocr/manifest.json",
  JSON.stringify(
    {
      source: "tesseract-ocr/tessdata_fast",
      revision: "4.1.0",
      license: "Apache-2.0",
      sha256: hashes,
    },
    null,
    2,
  ),
);
