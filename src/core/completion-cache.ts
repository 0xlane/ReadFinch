import { complete } from "./providers";
import { digest } from "./store";
import type { Config } from "../shared/config";
import type { CompletionUpdate, ThinkingSnapshot } from "../shared/completion";

type CachedCompletion = {
  text: string;
  thinking?: ThinkingSnapshot;
  created: number;
};
const bytes = (entry: Pick<CachedCompletion, "text" | "thinking">) =>
  (entry.text.length + (entry.thinking?.text.length ?? 0)) * 2;

// Only full successful answers enter this process-local cache. Keys never retain input or credentials.
export class CompletionCache {
  private entries = new Map<string, CachedCompletion>();
  private size = 0;
  private generation = 0;
  private policy: Config["cache"] = { enabled: true, minutes: 30 };
  constructor(
    private readonly now = Date.now,
    private readonly capacity = 8 * 1024 * 1024,
  ) {}
  configure(policy: Config["cache"]) {
    if (!policy.enabled && this.policy.enabled) this.clear();
    this.policy = { ...policy };
    this.prune();
  }
  clear() {
    this.generation++;
    this.entries.clear();
    this.size = 0;
  }
  private remove(key: string) {
    const removed = this.entries.get(key);
    if (removed) this.size -= bytes(removed);
    this.entries.delete(key);
  }
  private prune() {
    const cutoff = this.now() - this.policy.minutes * 60000;
    for (const [key, entry] of this.entries)
      if (entry.created <= cutoff) this.remove(key);
  }
  async run(
    ...[profile, messages, key, signal, onText, refresh = false, validate]: [
      ...Parameters<typeof complete>,
      boolean?,
      ((text: string) => void)?,
    ]
  ) {
    signal.throwIfAborted();
    if (!this.policy.enabled) {
      const result = await complete(profile, messages, key, signal, onText);
      validate?.(result);
      return result;
    }
    const id = digest([
      profile.id,
      profile.preset,
      profile.providerSettings ?? null,
      profile.translation ?? null,
      profile.endpoint,
      profile.proxy,
      profile.model,
      profile.modelKind ?? null,
      profile.temperature,
      profile.providerOptions ?? null,
      profile.reasoningEffort ?? null,
      profile.requiresKey,
      key ?? "",
      profile.headers ?? {},
      profile.outputContract ?? null,
      messages,
    ]);
    this.prune();
    const found = this.entries.get(id);
    if (found && !refresh) {
      validate?.(found.text);
      onText(found.text, found.thinking && { ...found.thinking });
      return found.text;
    }
    const generation = this.generation;
    let thinking: ThinkingSnapshot | undefined;
    const update: CompletionUpdate = (text, snapshot) => {
      thinking = snapshot && { ...snapshot };
      onText(text, snapshot);
    };
    const result = await complete(profile, messages, key, signal, update);
    validate?.(result);
    const entry: CachedCompletion = {
      text: result,
      thinking: thinking && { ...thinking, status: "complete" },
      created: this.now(),
    };
    if (
      generation === this.generation &&
      !signal.aborted &&
      result.trim() &&
      bytes(entry) <= this.capacity
    ) {
      this.remove(id);
      this.entries.set(id, entry);
      this.size += bytes(entry);
      while (this.size > this.capacity || this.entries.size > 256)
        this.remove(this.entries.keys().next().value!);
    }
    return result;
  }
}
