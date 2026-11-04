import { safeStorage } from "electron";
import path from "node:path";
import { atomicWrite, readJson } from "../core/store";
export class Secrets {
  private values: Record<string, { ciphertext: string; scope: string }> = {};
  private memory = new Map<string, { value: string; scope: string }>();
  private ready = false;
  constructor(private dir: string) {}
  get available() {
    return (
      this.ready &&
      (process.platform !== "linux" ||
        safeStorage.getSelectedStorageBackend() !== "basic_text")
    );
  }
  async init() {
    this.ready = await safeStorage.isAsyncEncryptionAvailable();
    this.values = await readJson(
      path.join(this.dir, "credentials.enc.json"),
      {},
    );
  }
  ids(scopeFor: (id: string) => string) {
    return [
      ...new Set([...Object.keys(this.values), ...this.memory.keys()]),
    ].filter((id) => {
      const record = this.memory.get(id) ?? this.values[id];
      return record?.scope === scopeFor(id);
    });
  }
  async get(id: string, scope: string) {
    // A probe can start immediately after the credentials editor loses focus.
    await this.queue;
    const memory = this.memory.get(id);
    if (memory) return memory.scope === scope ? memory.value : undefined;
    const record = this.values[id];
    if (!record || record.scope !== scope || !this.available) return undefined;
    try {
      return (
        await safeStorage.decryptStringAsync(
          Buffer.from(record.ciphertext, "base64"),
        )
      ).result;
    } catch {
      return undefined;
    }
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
    if (!this.available) {
      const next = { ...this.values };
      delete next[id];
      await atomicWrite(
        path.join(this.dir, "credentials.enc.json"),
        JSON.stringify(next),
      );
      this.values = next;
      if (value) this.memory.set(id, { value, scope });
      else this.memory.delete(id);
      return;
    }
    const next = { ...this.values };
    if (value)
      next[id] = {
        ciphertext: (await safeStorage.encryptStringAsync(value)).toString(
          "base64",
        ),
        scope,
      };
    else delete next[id];
    await atomicWrite(
      path.join(this.dir, "credentials.enc.json"),
      JSON.stringify(next),
    );
    this.values = next;
  }
}
