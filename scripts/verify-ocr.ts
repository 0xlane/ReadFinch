import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createWorker, PSM } from "tesseract.js";
import path from "node:path";
import assert from "node:assert/strict";
const cases = [
  {
    name: "bilingual-light",
    tokens: [
      "Small steps",
      "你好",
      "世界",
      "C:\\Projects\\TextHop\\src\\main.ts",
      "const total = 42;",
    ],
  },
  {
    name: "bilingual-dark",
    tokens: [
      "Small steps",
      "你好",
      "世界",
      "C:\\Projects\\TextHop\\src\\main.ts",
      "const total = 42;",
    ],
  },
  {
    name: "small-interface",
    tokens: ["Error", "42", "C:\\Projects\\TextHop", "世界"],
  },
];
const results = [];
for (const segmentation of [PSM.AUTO, PSM.SINGLE_BLOCK]) {
  const coldStart = performance.now();
  const worker = await createWorker(["eng", "chi_sim"], 1, {
    langPath: path.resolve("assets/ocr"),
    cacheMethod: "none",
    gzip: false,
    errorHandler: () => {},
  });
  const startupMs = performance.now() - coldStart;
  await worker.setParameters({
    tessedit_pageseg_mode: segmentation,
    preserve_interword_spaces: "1",
    user_defined_dpi: "150",
  });
  try {
    for (const sample of cases) {
      const start = performance.now();
      const { data } = await worker.recognize(
        await readFile(`tests/fixtures/${sample.name}.png`),
      );
      const matched = sample.tokens.filter((token) =>
        data.text.includes(token),
      );
      results.push({
        sample: sample.name,
        segmentation,
        startupMs: Math.round(startupMs),
        recognitionMs: Math.round(performance.now() - start),
        confidence: data.confidence,
        matched: matched.length,
        total: sample.tokens.length,
        text: data.text,
        rssMB: Math.round(process.memoryUsage().rss / 1048576),
      });
    }
  } finally {
    await worker.terminate();
  }
}
assert.ok(
  results
    .filter((r) => r.sample === "bilingual-light")
    .every((r) => r.matched >= 4),
  "Bilingual OCR regression",
);
const proof = (await readFile(".local/ocr-network-block.ndjson", "utf8"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line))
  .filter((x) => x.pid === process.pid);
assert.ok(
  proof.some((p) => !p.isMainThread),
  "Network block did not load in OCR worker",
);
await writeFile(
  "docs/offline-ocr-verification.json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      network:
        "HTTP(S), fetch, TCP and TLS blocked in main and worker processes; no API key",
      proof,
      results,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    results.map(({ text, ...rest }) => rest),
    null,
    2,
  ),
);
