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

const namespaces = new Map(
  Object.entries({
    gemini: "google",
    mimo: "xiaomi",
    qwen: "alibaba",
    qwenlm: "alibaba",
    "alibaba-cloud": "alibaba",
    "deepseek-ai": "deepseek",
    "meta-llama": "meta",
    mistralai: "mistral",
    "x-ai": "xai",
    "x.ai": "xai",
    "z-ai": "zhipuai",
    "zai-org": "zhipuai",
    thudm: "zhipuai",
    moonshot: "moonshotai",
    "xiaomi-mimo": "xiaomi",
  }),
);
function namespace(name: string) {
  return namespaces.get(name) ?? name;
}
const hostedCatalogs = new Set([
  "openrouter",
  "fireworks",
  "azure",
  "bedrock",
  "huggingface",
  "siliconflow",
  "togetherai",
]);
const knownCreators = new Set([
  "openai",
  "anthropic",
  "amazon",
  ...namespaces.values(),
]);

// These spellings identify catalog records only. Keep the account's original
// model ID for API calls, selection, and caching.
function identity(id: string) {
  const parts = id.trim().toLowerCase().split("/");
  let model = parts.pop()!;
  let owner = parts.pop() ?? "";
  if (owner === "models") {
    // Vertex publishers/google/models/… and Gemini models/… are resource paths.
    // Fireworks' accounts/<account>/models/… names a host, not the model creator.
    owner = parts.at(-2) === "publishers" ? parts.at(-1)! : "";
  }
  const bedrock =
    /^(?:(?:us|eu|apac|au|jp|global)\.)?(anthropic|amazon|meta|mistral|cohere|deepseek|openai|qwen)\.(.+)$/.exec(
      model,
    );
  if (bedrock) {
    owner = bedrock[1];
    model = bedrock[2].replace(/-v\d+:\d+$/, "");
  }
  model = model
    .replace(/(?:\s*\(free\)|:(?:free|cloud|nitro|floor))$/, "")
    .replace(/@(20\d{6})$/, "-$1")
    .replace(/(\d)[.p](?=\d)/g, "$1-")
    .replace(/[\s_-]+/g, "-");
  return { owner: namespace(owner), model };
}

type DirectoryIndex = Map<string, DirectoryEntry | null>;

export class ModelDirectory {
  private readonly exact = new Map<string, DirectoryEntry>();
  private readonly router = new Map<string, DirectoryEntry>();
  private readonly scoped: DirectoryIndex = new Map();
  private readonly bare: DirectoryIndex = new Map();
  private readonly owners = new Set<string>();
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
      const { owner, model } = identity(entry.id);
      if (owner) {
        this.owners.add(owner);
        this.index(this.scoped, owner + "/" + model, entry, owner);
      }
      this.index(this.bare, model, entry, owner);
    }
  }
  private index(
    index: DirectoryIndex,
    key: string,
    entry: DirectoryEntry,
    owner: string,
  ) {
    const existing = index.get(key);
    if (existing === null) return;
    if (
      existing &&
      (identity(existing.id).owner !== owner || existing.kind !== entry.kind)
    ) {
      index.set(key, null);
    } else if (
      !existing ||
      (this.isBundled(existing) && !this.isBundled(entry))
    ) {
      index.set(key, entry);
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
    const exact = this.exact.get(id);
    if (exact) return exact;
    const { owner, model } = identity(id);
    const scope = owner || namespace(preset);
    const resolve = (key: string) => {
      const scoped = this.scoped.get(scope + "/" + key);
      if (scoped !== undefined) return scoped;
      // An explicit creator must not silently resolve to a different one.
      if (
        owner &&
        !hostedCatalogs.has(owner) &&
        (this.owners.has(owner) || knownCreators.has(owner))
      )
        return undefined;
      return this.bare.get(key);
    };
    const candidate = resolve(model);
    if (candidate !== undefined) return candidate;
    // Fall back only to an actual undated catalog entry. Preserve named
    // variants, four-digit releases and OpenAI's dashed snapshot dates.
    const base = model.replace(
      /-(?:20\d{2}|2[3-9])(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/,
      "",
    );
    if (base !== model) return resolve(base);
  }
  lookup(preset: string, id: string) {
    return this.match(preset, id) ?? undefined;
  }
  isBundled(entry: DirectoryEntry) {
    return this.fallbackEntries.has(entry);
  }
}
