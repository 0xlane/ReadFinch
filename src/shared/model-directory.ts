export type ModelKind = "text" | "vision" | "speech";
export type DirectoryEntry = {
  id: string;
  name: string;
  kind: ModelKind;
  context?: number;
};
export const directoryUrls = {
  modelsDev: "https://models.dev/models.json?type=all",
  openRouter: "https://openrouter.ai/api/v1/models",
} as const;
export type DirectorySource = keyof typeof directoryUrls;
export type DirectoryData = Record<DirectorySource, DirectoryEntry[]> & {
  bundledSources?: DirectorySource[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function validText(v: unknown, max: number): v is string {
  return (
    typeof v === "string" &&
    v.trim().length > 0 &&
    v.length <= max &&
    !/[\u0000-\u001f\u007f]/u.test(v)
  );
}
export function parseDirectory(
  source: DirectorySource,
  json: unknown,
): DirectoryEntry[] {
  const root = record(json);
  const rows: unknown[] =
    source === "modelsDev"
      ? Object.values(root)
      : Array.isArray(root.data)
        ? root.data
        : [];
  const entries = new Map<string, DirectoryEntry>();
  for (const row of rows) {
    const d = record(row);
    if (!validText(d.id, 200) || !validText(d.name, 200)) continue;
    const canonical = source === "modelsDev";
    const modalities = record(canonical ? d.modalities : d.architecture);
    const input = canonical ? modalities.input : modalities.input_modalities;
    const output = canonical ? modalities.output : modalities.output_modalities;
    if (
      !Array.isArray(input) ||
      !Array.isArray(output) ||
      !input.includes("text")
    )
      continue;
    const kind =
      (d.type === "speech" ||
        (!d.type && output.length === 1 && output[0] === "audio")) &&
      output.includes("audio")
        ? "speech"
        : (!d.type || d.type === "chat") &&
            output.includes("text") &&
            !output.includes("image")
          ? input.includes("image")
            ? "vision"
            : "text"
          : undefined;
    if (!kind) continue;
    const context = canonical ? record(d.limit).context : d.context_length;
    entries.set(d.id, {
      id: d.id,
      name: d.name,
      kind,
      ...(typeof context === "number" &&
      Number.isSafeInteger(context) &&
      context > 0
        ? { context }
        : {}),
    });
  }
  if (!entries.size || entries.size > 25000)
    throw Error("Invalid public model directory");
  return [...entries.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

const namespaces: Record<string, string> = {
  gemini: "google",
  mimo: "xiaomi",
  qwen: "qwen",
  mistral: "mistralai",
  xai: "x-ai",
  moonshotai: "moonshotai",
};
// A bare vendor ID can match the complete model part of a canonical lab/model ID.
// Never remove namespaces from the requested ID or guess from partial names.
export class ModelDirectory {
  private readonly exact = new Map<string, DirectoryEntry>();
  private readonly router = new Map<string, DirectoryEntry>();
  private readonly bare = new Map<string, DirectoryEntry | null>();
  private readonly fallbackEntries = new WeakSet<DirectoryEntry>();
  constructor(data: DirectoryData) {
    for (const source of data.bundledSources ?? [])
      for (const entry of data[source]) this.fallbackEntries.add(entry);
    for (const entry of data.openRouter) {
      this.router.set(entry.id, entry);
      this.exact.set(entry.id, entry);
    }
    for (const entry of data.modelsDev) {
      const existing = this.exact.get(entry.id);
      if (!existing || !this.isBundled(entry) || this.isBundled(existing))
        this.exact.set(entry.id, entry);
    }
    for (const entry of this.exact.values()) {
      const parts = entry.id.split("/");
      if (parts.length !== 2) continue;
      const id = parts[1];
      this.bare.set(id, this.bare.has(id) ? null : entry);
    }
  }
  // null means the live directory positively reports a collision. Never revive
  // an older, once-unambiguous match from the bundled snapshot in that case.
  match(preset: string, id: string): DirectoryEntry | null | undefined {
    if (!id) return;
    const routerEntry =
      preset === "openrouter" ? this.router.get(id) : undefined;
    if (
      routerEntry &&
      (!this.isBundled(routerEntry) || this.isBundled(this.exact.get(id)!))
    )
      return routerEntry;
    return (
      this.exact.get(id) ??
      (id.includes("/")
        ? undefined
        : (this.exact.get((namespaces[preset] ?? preset) + "/" + id) ??
          this.bare.get(id)))
    );
  }
  lookup(preset: string, id: string) {
    return this.match(preset, id) ?? undefined;
  }
  isBundled(entry: DirectoryEntry) {
    return this.fallbackEntries.has(entry);
  }
}
