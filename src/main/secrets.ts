import path from "node:path";
import { atomicWrite, readJson } from "../core/store";
type Credential = { value: string; scope: string };

// Only old installations need the OS key store. New credentials never use it.
async function decryptLegacy(ciphertext: string) {
  const { safeStorage } = await import("electron");
  if (!(await safeStorage.isAsyncEncryptionAvailable()))
    throw Error("Legacy storage unavailable");
  return (
    await safeStorage.decryptStringAsync(Buffer.from(ciphertext, "base64"))
  ).result;
}

export class Secrets {
  private values: Record<string, Credential> = {};
  constructor(
    private dir: string,
    private decrypt = decryptLegacy,
  ) {}
  private get file() {
    return path.join(this.dir, "credentials.json");
  }
  async init() {
    const saved = await readJson<Record<string, Credential> | null>(
      this.file,
      null,
    );
    if (saved !== null) {
      this.values = saved;
      return;
    }
    const legacy = await readJson<
      Record<string, { ciphertext: string; scope: string }>
    >(path.join(this.dir, "credentials.enc.json"), {});
    for (const [id, record] of Object.entries(legacy)) {
      try {
        this.values[id] = {
          value: await this.decrypt(record.ciphertext),
          scope: record.scope,
        };
      } catch {
        // Preserve the original encrypted file; unavailable keys can be re-entered.
      }
    }
    // A completed migration also prevents removed keys from reappearing on restart.
    await atomicWrite(this.file, JSON.stringify(this.values));
  }
  ids(scopeFor: (id: string) => string) {
    return Object.keys(this.values).filter(
      (id) => this.values[id].scope === scopeFor(id),
    );
  }
  async get(id: string, scope: string) {
    const record = this.values[id];
    return record?.scope === scope ? record.value : undefined;
  }
  private queue: Promise<unknown> = Promise.resolve();
  set(id: string, value: string, scope: string) {
    const task = this.queue.then(() => this.write(id, value, scope));
    this.queue = task.catch(() => {});
    return task;
  }
  private async write(id: string, value: string, scope: string) {
    if (
      !/^(text|ocr|headers):[\w-]+$|^webdav$/.test(id) ||
      value.length > 16000
    )
      throw Error("凭据字段无效");
    const next = { ...this.values };
    if (value) next[id] = { value, scope };
    else delete next[id];
    await atomicWrite(this.file, JSON.stringify(next));
    this.values = next;
  }
}
