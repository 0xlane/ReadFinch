import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
// @ts-expect-error Build tooling is an executable JavaScript module.
import { prepareOcrAssets } from "../scripts/download-ocr.mjs";

const assets = {
  eng: Buffer.from("English fixture"),
  chi_sim: Buffer.from("中文 fixture"),
};
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "readfinch-ocr-assets-"));
  assert.equal(path.dirname(dir), path.resolve(tmpdir()));
  const manifest = JSON.stringify({
    source: "tesseract-ocr/tessdata_fast",
    revision: "4.1.0",
    sha256: Object.fromEntries(
      Object.entries(assets).map(([lang, bytes]) => [
        lang,
        createHash("sha256").update(bytes).digest("hex"),
      ]),
    ),
  });
  await writeFile(path.join(dir, "manifest.json"), manifest);
  return { dir, manifest };
}

test("OCR build assets reuse verified cache without network access", async () => {
  const { dir } = await fixture();
  try {
    for (const [lang, bytes] of Object.entries(assets))
      await writeFile(path.join(dir, lang + ".traineddata"), bytes);
    await prepareOcrAssets(dir, () => {
      throw Error("Network must not be used");
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("OCR downloads retry transient failures and repair corrupt cache against pinned hashes", async () => {
  const { dir, manifest } = await fixture();
  let requests = 0;
  try {
    await writeFile(path.join(dir, "eng.traineddata"), "corrupted");
    await prepareOcrAssets(
      dir,
      async (url: string, options: { signal: AbortSignal }) => {
        assert.ok(options.signal instanceof AbortSignal);
        if (++requests === 1) throw Error("ECONNRESET");
        return new Response(
          assets[url.endsWith("/eng.traineddata") ? "eng" : "chi_sim"],
        );
      },
      async () => {},
    );
    assert.equal(requests, 3);
    assert.deepEqual(
      await readFile(path.join(dir, "eng.traineddata")),
      assets.eng,
    );
    assert.deepEqual(
      await readFile(path.join(dir, "chi_sim.traineddata")),
      assets.chi_sim,
    );
    assert.equal(
      await readFile(path.join(dir, "manifest.json"), "utf8"),
      manifest,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("OCR downloads never accept a bad digest or rewrite the trusted manifest", async () => {
  const { dir, manifest } = await fixture();
  let requests = 0;
  try {
    await writeFile(path.join(dir, "eng.traineddata"), "old invalid file");
    await assert.rejects(
      prepareOcrAssets(
        dir,
        async () => {
          requests++;
          return new Response("untrusted download");
        },
        async () => {},
      ),
      /Could not prepare OCR asset eng/,
    );
    assert.equal(requests, 3);
    assert.equal(
      await readFile(path.join(dir, "eng.traineddata"), "utf8"),
      "old invalid file",
    );
    assert.equal(
      await readFile(path.join(dir, "manifest.json"), "utf8"),
      manifest,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
