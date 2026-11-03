import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import {
  UpdateFailure,
  type ReleaseFile,
  type UpdateFetch,
} from "./update-manifest";
import type { UpdateState } from "../shared/updates";

export async function verifyUpdateFile(
  file: string,
  expected: ReleaseFile,
): Promise<boolean> {
  try {
    let size = 0;
    const hash = createHash("sha512");
    for await (const bytes of createReadStream(file)) {
      size += bytes.length;
      if (size > expected.size) return false;
      hash.update(bytes);
    }
    return size === expected.size && hash.digest("base64") === expected.sha512;
  } catch {
    return false;
  }
}
export async function downloadVerifiedUpdate(options: {
  fetch: UpdateFetch;
  url: string;
  file: ReleaseFile;
  directory: string;
  signal: AbortSignal;
  progress: (value: NonNullable<UpdateState["progress"]>) => void;
}): Promise<string> {
  const { file, signal } = options;
  const destination = path.join(options.directory, file.name);
  if (await verifyUpdateFile(destination, file)) return destination;
  await mkdir(options.directory, { recursive: true });
  const temporary = destination + "." + randomUUID() + ".part";
  const abort = new AbortController();
  const combined = AbortSignal.any([
    signal,
    abort.signal,
    AbortSignal.timeout(20 * 60 * 1000),
  ]);
  let stall: ReturnType<typeof setTimeout>;
  const arm = () => {
    clearTimeout(stall);
    stall = setTimeout(() => abort.abort(), 30000);
    stall.unref?.();
  };
  arm();
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const response = await options.fetch(options.url, {
      signal: combined,
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok || !response.body)
      throw new UpdateFailure(
        "更新下载失败，请重试或前往 GitHub Releases 下载。",
      );
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) !== file.size)
      throw new UpdateFailure("安装包校验失败，已停止更新。");
    handle = await open(temporary, "wx", 0o600);
    const reader = response.body.getReader(),
      hash = createHash("sha512"),
      started = Date.now();
    let transferred = 0,
      lastProgress = 0;
    try {
      while (true) {
        combined.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        arm();
        transferred += value.length;
        if (transferred > file.size)
          throw new UpdateFailure("安装包校验失败，已停止更新。");
        hash.update(value);
        await handle.writeFile(value);
        if (Date.now() - lastProgress >= 150) {
          lastProgress = Date.now();
          options.progress({
            percent: Math.min(100, (transferred / file.size) * 100),
            transferred,
            total: file.size,
            bytesPerSecond:
              transferred / Math.max(1, (Date.now() - started) / 1000),
          });
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    if (transferred !== file.size || hash.digest("base64") !== file.sha512)
      throw new UpdateFailure("安装包校验失败，已停止更新。");
    await handle.sync();
    await handle.close();
    handle = undefined;
    combined.throwIfAborted();
    await rename(temporary, destination);
    return destination;
  } finally {
    clearTimeout(stall!);
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
  }
}
