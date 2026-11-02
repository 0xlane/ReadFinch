import { createWorker, PSM } from "tesseract.js";
import { stat } from "node:fs/promises";
import path from "node:path";
export const OCR_LANGUAGES = ["eng", "chi_sim"];
export async function assetsReady(dir: string) {
  try {
    for (const lang of OCR_LANGUAGES) {
      const s = await stat(path.join(dir, lang + ".traineddata"));
      if (s.size < 100_000) return false;
    }
    return true;
  } catch {
    return false;
  }
}
export async function offlineRecognize(
  data: Buffer,
  dir: string,
  signal: AbortSignal,
  onProgress: (n: number) => void,
) {
  if (!(await assetsReady(dir)))
    throw Error("内置 OCR 资源缺失或损坏，请重新安装 TextHop");
  if (signal.aborted) throw Error("已取消");
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let rejectAbort: (reason: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    void worker?.terminate();
    rejectAbort(new Error("已取消"));
  };
  signal.addEventListener("abort", abort, { once: true });
  const work = (async () => {
    worker = await createWorker(["eng", "chi_sim"], 1, {
      langPath: dir,
      cacheMethod: "none",
      gzip: false,
      logger: (m) => {
        if (!signal.aborted && m.status === "recognizing text")
          onProgress(m.progress);
      },
      errorHandler: () => {},
    });
    if (signal.aborted) {
      await worker.terminate();
      throw Error("已取消");
    }
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "150",
    });
    const { data: result } = await worker.recognize(data);
    return { text: result.text, confidence: result.confidence };
  })();
  try {
    return await Promise.race([work, aborted]);
  } finally {
    signal.removeEventListener("abort", abort);
    await worker?.terminate().catch(() => {});
  }
}
