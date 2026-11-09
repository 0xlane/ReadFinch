import {
  appendFile,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { randomUUID } from "node:crypto";

export const SelectionProbeSchema = z.object({
  stage: z.enum([
    "idle",
    "foreground",
    "edit-selection",
    "edit-text",
    "java-pump",
    "java-selection",
    "uia-focus",
    "uia-focused-path",
    "uia-point",
    "uia-point-path",
    "uia-cached",
    "uia-pattern",
    "uia-selection",
    "uia-text",
    "uia-bounds",
    "replace-validate",
    "replace-write",
  ]),
  targetPid: z.number().int().nonnegative(),
  app: z
    .string()
    .max(96)
    .regex(/^[^\\/:<>"|?*\u0000-\u001f]*$/u),
});
export type SelectionProbe = z.infer<typeof SelectionProbeSchema>;
const number = z.number().finite().nonnegative();
const EventSchema = z.object({
  appVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/)
    .optional(),
  event: z.enum([
    "app_start",
    "helper_start",
    "helper_ready",
    "helper_exit",
    "helper_error",
    "helper_retry",
    "heartbeat_timeout",
    "read_timeout",
    "replace_timeout",
    "slow_operation",
    "operation_error",
  ]),
  helperPid: number.optional(),
  probe: SelectionProbeSchema.optional(),
  elapsedMs: number.optional(),
  heartbeatAgeMs: number.optional(),
  attempt: number.optional(),
  delayMs: number.optional(),
  exitCode: z.number().int().nullable().optional(),
  code: z
    .enum([
      "ENOENT",
      "EACCES",
      "EPERM",
      "EPIPE",
      "UNKNOWN",
      "TimeoutException",
      "ElementNotAvailableException",
      "InvalidOperationException",
      "COMException",
      "OTHER",
    ])
    .optional(),
});
export type DiagnosticEvent = z.infer<typeof EventSchema>;
const RecordSchema = EventSchema.extend({
  time: z.string().datetime(),
  session: z.string().uuid().optional(),
});

// Intentionally accepts only structured identifiers and timings. Never append
// raw errors, stacks, stderr, selected text, API settings, or arbitrary objects.
export class Diagnostics {
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private size: number | undefined;
  private dropped = 0;
  private failures = 0;
  private readonly session = randomUUID();
  constructor(
    private directory: string,
    private maxBytes = 512 * 1024,
  ) {}
  private file(index = 0) {
    return path.join(
      this.directory,
      `selection${index ? "." + index : ""}.jsonl`,
    );
  }
  record(input: unknown) {
    const parsed = EventSchema.safeParse(input);
    if (!parsed.success) return;
    if (this.pending >= 128) {
      this.dropped++;
      return;
    }
    const line =
      JSON.stringify({
        time: new Date().toISOString(),
        session: this.session,
        ...parsed.data,
      }) + "\n";
    const bytes = Buffer.byteLength(line);
    if (bytes > this.maxBytes) {
      this.dropped++;
      return;
    }
    this.pending++;
    this.queue = this.queue
      .then(async () => {
        await mkdir(this.directory, { recursive: true });
        if (this.size === undefined)
          this.size = await stat(this.file())
            .then((s) => s.size)
            .catch((e) => {
              if (e.code !== "ENOENT") throw e;
              return 0;
            });
        if (this.size + bytes > this.maxBytes) {
          await unlink(this.file(2)).catch((e) => {
            if (e.code !== "ENOENT") throw e;
          });
          for (let index = 1; index >= 0; index--) {
            await rename(this.file(index), this.file(index + 1)).catch((e) => {
              if (e.code !== "ENOENT") throw e;
            });
          }
          this.size = 0;
        }
        await appendFile(this.file(), line, { mode: 0o600 });
        this.size += bytes;
      })
      .catch(() => {
        this.failures++;
        this.size = undefined;
      })
      .finally(() => {
        this.pending--;
      });
  }
  async snapshot() {
    // Serialize reads with rotation; export cannot observe a half-rotated set.
    const result = this.queue.then(async () => {
      const directory = await stat(this.directory).catch((e) => {
        if (e.code !== "ENOENT") throw e;
        return null;
      });
      if (directory && !directory.isDirectory())
        throw Error("Diagnostic storage is unavailable");
      const events: z.infer<typeof RecordSchema>[] = [];
      for (let index = 2; index >= 0; index--) {
        const file = this.file(index);
        try {
          if ((await stat(file)).size > this.maxBytes) continue;
          for (const line of (await readFile(file, "utf8")).split("\n")) {
            try {
              const record = RecordSchema.safeParse(JSON.parse(line));
              if (record.success) events.push(record.data);
            } catch {}
          }
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
      }
      return {
        events,
        droppedRecords: this.dropped,
        writeFailures: this.failures,
      };
    });
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
}
