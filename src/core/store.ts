import {
  mkdir,
  readFile,
  writeFile,
  rename,
  copyFile,
  open,
} from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  defaultConfig,
  parseConfig,
  type CredentialMove,
  type Config,
} from "../shared/config";
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export const digest = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export async function atomicWrite(file: string, data: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = file + "." + randomUUID() + ".tmp";
  const handle = await open(temp, "wx", 0o600);
  try {
    await handle.writeFile(data, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, file);
}
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw Error(
      `本机状态文件无法读取：${path.basename(file)}。请先备份并恢复。`,
    );
  }
}
export class ConfigStore {
  private value: Config = defaultConfig();
  private queue: Promise<unknown> = Promise.resolve();
  recovery?: string;
  credentialMoves: CredentialMove[] = [];
  private readConfig(raw: string) {
    const moves: CredentialMove[] = [];
    const config = parseConfig(raw, moves);
    this.credentialMoves = moves;
    return config;
  }
  constructor(readonly dir: string) {}
  get file() {
    return path.join(this.dir, "config.json");
  }
  get config() {
    return structuredClone(this.value);
  }
  get revision() {
    return digest(this.value);
  }
  async init() {
    await mkdir(this.dir, { recursive: true });
    try {
      this.value = this.readConfig(await readFile(this.file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        await atomicWrite(this.file, JSON.stringify(this.value, null, 2));
        return;
      }
      const broken = path.join(this.dir, `config-invalid-${Date.now()}.json`);
      await copyFile(this.file, broken);
      try {
        this.value = this.readConfig(
          await readFile(this.file + ".bak", "utf8"),
        );
        this.recovery = "配置损坏，已恢复上次有效备份；原文件已保留。";
      } catch {
        this.value = defaultConfig();
        this.recovery = "配置损坏，已启动默认设置；原文件已保留在数据目录。";
      }
      await atomicWrite(this.file, JSON.stringify(this.value, null, 2));
    }
  }
  async save(input: unknown, expected = this.revision): Promise<Config> {
    const next = parseConfig(input);
    const serialized = JSON.stringify(next, null, 2) + "\n";
    if (Buffer.byteLength(serialized) > 2_000_000)
      throw Error("配置文件超过 2 MB");
    const task = this.queue.then(async () => {
      if (expected !== this.revision)
        throw Error("配置已被其他窗口或同步更新，请重新载入后重试");
      await copyFile(this.file, this.file + ".bak");
      await atomicWrite(this.file, serialized);
      this.value = next;
      return this.config;
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async backup(label: string, value: Config = this.config) {
    const file = path.join(
      this.dir,
      "backups",
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}-${randomUUID().slice(0, 6)}.json`,
    );
    await atomicWrite(file, JSON.stringify(parseConfig(value), null, 2));
    return file;
  }
}
