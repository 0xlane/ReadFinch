import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { atomicWrite } from "./store";
import { bundledDirectoryData } from "../shared/model-capabilities";
import {
  directoryUrls,
  parseDirectory,
  type DirectoryData,
  type DirectorySource,
} from "../shared/model-directory";

const sources = Object.keys(directoryUrls) as DirectorySource[];
const day = 24 * 60 * 60 * 1000;
const limit = 16 * 1024 * 1024;
const cacheSchema = z.object({
  updated: z.number().int().nonnegative(),
  entries: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        name: z.string().min(1).max(200),
        kind: z.enum(["text", "vision", "speech"]),
        context: z.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(25000),
});
export class PublicModelDirectory {
  private cache: Partial<Record<DirectorySource, z.infer<typeof cacheSchema>>> =
    {};
  private retryAfter: Partial<Record<DirectorySource, number>> = {};
  private loading?: Promise<void>;
  private refreshing?: Promise<DirectoryData>;
  constructor(
    private dir: string,
    private request: typeof fetch = fetch,
    private now = Date.now,
  ) {}
  private file(key: DirectorySource) {
    return path.join(this.dir, "model-directory", key + ".json");
  }
  private load() {
    return (this.loading ??= Promise.all(
      sources.map(async (key) => {
        try {
          if ((await stat(this.file(key))).size > limit) return;
          const value = cacheSchema.parse(
            JSON.parse(await readFile(this.file(key), "utf8")),
          );
          if (value.updated <= this.now()) this.cache[key] = value;
        } catch {
          /* A missing or damaged cache is safe to rebuild. */
        }
      }),
    ).then(() => {}));
  }
  async read(): Promise<DirectoryData> {
    await this.load();
    return {
      modelsDev:
        this.cache.modelsDev?.entries ?? bundledDirectoryData.modelsDev,
      openRouter:
        this.cache.openRouter?.entries ?? bundledDirectoryData.openRouter,
      bundledSources: sources.filter((key) => !this.cache[key]),
    };
  }
  refresh(): Promise<DirectoryData> {
    return (this.refreshing ??= this.refreshSources().finally(() => {
      this.refreshing = undefined;
    }));
  }
  private async refreshSources() {
    await this.load();
    await Promise.all(
      sources.map(async (key) => {
        const now = this.now();
        if (
          (this.cache[key] && now - this.cache[key]!.updated < day) ||
          now < (this.retryAfter[key] ?? 0)
        )
          return;
        try {
          // Fixed public URLs only. No provider IDs, endpoints, keys or user text leave the device.
          const response = await this.request(directoryUrls[key], {
            credentials: "omit",
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          });
          if (
            !response.ok ||
            !response.body ||
            Number(response.headers.get("content-length")) > limit
          )
            throw Error("Model directory unavailable");
          const reader = response.body.getReader(),
            chunks: Uint8Array[] = [];
          let bytes = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.length;
            if (bytes > limit) {
              await reader.cancel();
              throw Error("Model directory too large");
            }
            chunks.push(value);
          }
          const entries = parseDirectory(
            key,
            JSON.parse(Buffer.concat(chunks).toString("utf8")),
          );
          const hit = { entries, updated: now };
          this.cache[key] = hit;
          await atomicWrite(this.file(key), JSON.stringify(hit));
        } catch {
          this.retryAfter[key] = now + 15 * 60 * 1000;
        }
      }),
    );
    return this.read();
  }
}
