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
import { initialTargetLanguage } from "../shared/languages";
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
  parse(input: unknown) {
    // An imported old "follow" value has no target of its own. Do not re-detect on this device.
    return parseConfig(input, [], () => this.value.defaults.targetLanguage);
  }
  private readConfig(raw: string) {
    const moves: CredentialMove[] = [];
    const config = parseConfig(raw, moves, () =>
      initialTargetLanguage(this.preferredLanguages()),
    );
    this.credentialMoves = moves;
    return this.normalize(config);
  }
  constructor(
    readonly dir: string,
    private readonly normalize: (config: Config) => Config = (config) => config,
    private readonly preferredLanguages: () => readonly string[] = () => [],
  ) {}
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
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
      this.value = this.readConfig(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        this.value = this.normalize(defaultConfig(this.preferredLanguages()));
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
        this.value = this.normalize(defaultConfig(this.preferredLanguages()));
        this.recovery = "配置损坏，已启动默认设置；原文件已保留在数据目录。";
      }
      await atomicWrite(this.file, JSON.stringify(this.value, null, 2));
      return;
    }
    const original = JSON.parse(raw);
    if (
      original.schemaVersion === 14 ||
      original.defaults.targetLanguage === "system" ||
      original.defaults.targetLanguage === "auto"
    ) {
      // Older schemas may still need credential moves on startup. Freeze only
      // their language until the existing credential migration has finished.
      const upgraded =
        original.schemaVersion === 14
          ? this.value
          : {
              ...original,
              defaults: {
                ...original.defaults,
                targetLanguage: this.value.defaults.targetLanguage,
              },
            };
      await atomicWrite(this.file + ".bak", raw);
      await atomicWrite(this.file, JSON.stringify(upgraded, null, 2) + "\n");
    }
  }
  async save(input: unknown, expected = this.revision): Promise<Config> {
    const next = parseConfig(this.normalize(this.parse(input)));
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
