import {
  spawn,
  execFile,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Selection, Snapshot } from "../shared/api";
import {
  SelectionProbeSchema,
  type SelectionProbe,
  type DiagnosticEvent,
} from "../core/diagnostics";
const exec = promisify(execFile);
type NativeOptions = {
  platform?: NodeJS.Platform;
  spawn?: (binary: string, args: string[]) => ChildProcessWithoutNullStreams;
  diagnostic?: (event: DiagnosticEvent) => void;
};
export class SelectionService extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;
  private timer?: ReturnType<typeof setInterval>;
  private last = "";
  private polling?: Promise<void>;
  private heartbeat = Date.now();
  private watchdog?: ReturnType<typeof setInterval>;
  private running = false;
  private recovering = false;
  private restartTimer?: ReturnType<typeof setTimeout>;
  private restartAttempts = 0;
  private launchedAt = 0;
  private probe?: SelectionProbe;
  private probeAt = 0;
  private lastOperationError = "";
  private lastOperationErrorAt = 0;
  private readonly platform: NodeJS.Platform;
  private requests = new Map<
    string,
    {
      resolve: () => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private reads = new Map<
    string,
    {
      resolve: (selection: Selection | undefined) => void;
      onJavaBridgeUnavailable?: () => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  status = "正在连接系统选区";
  state: Snapshot["nativeState"] = "starting";
  private stalled = false;
  private connectedMessage = "系统选区已连接";
  private setStatus(message: string, state: Snapshot["nativeState"]) {
    if (this.status === message && this.state === state) return;
    this.status = message;
    this.state = state;
    this.emit("status", { message, state });
  }
  current?: Selection;
  private diagnose(event: DiagnosticEvent) {
    try {
      this.options.diagnostic?.({ helperPid: this.child?.pid, ...event });
    } catch {
      /* Logging must not interrupt selection. */
    }
  }
  constructor(
    private nativeRoot: string,
    private options: NativeOptions = {},
  ) {
    super();
    this.platform = options.platform ?? process.platform;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.restartAttempts = 0;
    this.heartbeat = Date.now();
    if (this.platform === "linux") {
      if (
        process.env.XDG_SESSION_TYPE === "wayland" ||
        process.env.WAYLAND_DISPLAY
      ) {
        this.setStatus(
          "Wayland：使用框选取词或剪贴板；截图由桌面门户确认",
          "limited",
        );
        return;
      }
      this.setStatus("X11：正在检查 PRIMARY 选区支持", "starting");
      this.timer = setInterval(() => void this.pollX11(), 500);
      return;
    }
    this.startHelper();
  }
  private startHelper() {
    if (!this.running || this.child) return;
    this.recovering = false;
    this.probe = undefined;
    this.heartbeat = this.launchedAt = Date.now();
    const binary = path.join(
      this.nativeRoot,
      "bin",
      this.platform === "win32"
        ? "readfinch-selection.exe"
        : "readfinch-selection",
    );
    const launch =
      this.options.spawn ??
      ((binary, args) =>
        spawn(binary, args, {
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        }));
    const child = (this.child = launch(binary, [String(process.pid)]));
    this.diagnose({ event: "helper_start", attempt: this.restartAttempts });
    const active = () =>
      this.running && this.child === child && !this.recovering;
    let buffer = "";
    child.stdout.setEncoding("utf8");
    // Native libraries may write diagnostics to stderr. Always drain the pipe
    // so a full pipe cannot block the selection worker.
    child.stderr.resume();
    child.stdin.on("error", () => {
      if (active()) this.finishReads();
    });
    child.stdout.on("data", (chunk: string) => {
      if (!active()) return;
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, i).replace(/^\uFEFF/, "");
        buffer = buffer.slice(i + 1);
        try {
          this.receive(JSON.parse(line));
        } catch {}
      }
    });
    const disconnected = (
      failedToStart: boolean,
      exitCode: number | null = null,
    ) => {
      if (!this.running || this.child !== child) return;
      this.diagnose({ event: "helper_exit", exitCode, probe: this.probe });
      this.stopWatchdog();
      this.child = undefined;
      this.invalidate();
      this.finishReads();
      this.finishRequests("替换未确认，请检查目标内容，勿重复操作");
      if (this.platform === "win32") {
        this.setStatus(
          "划词服务正在自动恢复；可暂时使用框选取词或剪贴板",
          "starting",
        );
        this.scheduleRestart();
      } else if (failedToStart || this.state !== "error") {
        this.setStatus(
          failedToStart
            ? "选区助手未启动；可框选取词或读取剪贴板，重启后重试"
            : "选区助手已停止；可框选取词或读取剪贴板，重启后重试",
          "error",
        );
      }
    };
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (this.child !== child || !this.running) return;
      const code = ["ENOENT", "EACCES", "EPERM", "EPIPE"].includes(
        error.code ?? "",
      )
        ? (error.code as "ENOENT" | "EACCES" | "EPERM" | "EPIPE")
        : "UNKNOWN";
      this.diagnose({ event: "helper_error", code });
      // A spawn failure has no process to retire. Other process errors must
      // not detach a live helper and accidentally create a second worker.
      if (!child.pid) disconnected(true);
    });
    child.on("exit", (code) => disconnected(false, code));
    this.watchdog = setInterval(() => {
      if (!this.running || this.child !== child || this.state === "limited")
        return;
      if (this.recovering) {
        // A failed OS termination must not leave recovery permanently stuck.
        // Keep one helper only and retry terminating that same owned process.
        child.kill();
        return;
      }
      if (Date.now() - this.heartbeat > 10000) {
        if (!this.stalled)
          this.diagnose({
            event: "heartbeat_timeout",
            heartbeatAgeMs: Date.now() - this.heartbeat,
            probe: this.probe,
            elapsedMs: this.probe ? Date.now() - this.probeAt : undefined,
          });
        if (this.platform === "win32") {
          this.recovering = true;
          this.setStatus(
            "划词服务正在自动恢复；可暂时使用框选取词或剪贴板",
            "starting",
          );
          this.invalidate();
          this.finishReads();
          this.finishRequests("替换未确认，请检查目标内容，勿重复操作");
          // Only the owned helper is terminated. Wait for its exit before
          // starting another; never replay a pending replacement command.
          child.kill();
          return;
        }
        this.stalled = true;
        this.setStatus(
          "目标应用的辅助功能响应超时；可框选取词或读取剪贴板",
          "error",
        );
        this.invalidate();
      }
    }, 3000);
  }
  private scheduleRestart() {
    if (!this.running || this.restartTimer) return;
    const delay = Math.min(
      30000,
      500 * 2 ** Math.min(this.restartAttempts++, 6),
    );
    this.diagnose({
      event: "helper_retry",
      attempt: this.restartAttempts,
      delayMs: delay,
    });
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      this.startHelper();
    }, delay);
  }
  private receive(event: any) {
    if (!event || typeof event.type !== "string") return;
    if (event.type === "probe") {
      const result = SelectionProbeSchema.safeParse(event);
      if (!result.success) return;
      const now = Date.now();
      if (
        this.probe &&
        this.probe.stage !== "idle" &&
        now - this.probeAt >= 1500
      )
        this.diagnose({
          event: "slow_operation",
          probe: this.probe,
          elapsedMs: now - this.probeAt,
        });
      this.probe = result.data;
      this.probeAt = now;
      // Progress probes are not completed-work heartbeats. A slow provider
      // must not postpone the watchdog indefinitely by traversing new nodes.
      return;
    }
    if (event.type === "operationError") {
      const key = JSON.stringify([this.probe, event.code]);
      const now = Date.now();
      if (
        key !== this.lastOperationError ||
        now - this.lastOperationErrorAt >= 10000
      ) {
        const code = [
          "TimeoutException",
          "ElementNotAvailableException",
          "InvalidOperationException",
          "COMException",
        ].includes(event.code)
          ? event.code
          : "OTHER";
        this.diagnose({
          event: "operation_error",
          probe: this.probe,
          code,
          elapsedMs: this.probe ? now - this.probeAt : undefined,
        });
        this.lastOperationError = key;
        this.lastOperationErrorAt = now;
      }
      return;
    }
    this.heartbeat = Date.now();
    // A "ready" banner alone does not establish health: the very first UIA
    // call may hang again. Reset backoff only after sustained worker progress.
    if (event.type === "heartbeat" && Date.now() - this.launchedAt >= 30000)
      this.restartAttempts = 0;
    if (
      event.type === "diagnostic" &&
      process.env.READFINCH_SELECTION_DIAGNOSTICS === "1"
    ) {
      // Diagnostic mode never logs the selected text, window title, or clipboard.
      console.info(
        "[ReadFinch selection]",
        JSON.stringify({
          stage: event.stage,
          role: event.role,
          length: event.length,
          clicks: event.clicks,
          age: event.age,
          accepted: event.accepted,
        }),
      );
      return;
    }
    if (
      this.stalled &&
      ["heartbeat", "ready", "selection"].includes(event.type)
    ) {
      this.stalled = false;
      this.setStatus(this.connectedMessage, "ready");
    }
    if (event.type === "ready") {
      this.diagnose({ event: "helper_ready" });
      this.connectedMessage = event.message;
      this.setStatus(event.message, "ready");
    }
    if (event.type === "error") this.setStatus(event.message, "error");
    if (event.type === "permission") {
      this.stalled = false;
      this.invalidate();
      this.setStatus(event.message, "limited");
    }
    if (event.type === "selection") {
      this.current = {
        token: event.token,
        text: event.text,
        app: event.app,
        x: event.x,
        y: event.y,
        canReplace: event.canReplace,
      };
      this.emit("selection", this.current);
    }
    if (event.type === "invalid") this.invalidate();
    if (event.type === "selectionSnapshot") {
      const pending = this.reads.get(event.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.reads.delete(event.id);
      const value = event.selection;
      if (
        value &&
        typeof value.token === "string" &&
        typeof value.text === "string" &&
        value.text.trim() &&
        value.text.length <= 100000
      ) {
        this.current = value;
        pending.resolve(value);
      } else {
        this.invalidate();
        if (event.javaBridgeUnavailable === true)
          pending.onJavaBridgeUnavailable?.();
        pending.resolve(undefined);
      }
    }
    if (event.type === "response") {
      const pending = this.requests.get(event.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.requests.delete(event.id);
        event.ok ? pending.resolve() : pending.reject(Error(event.error));
      }
    }
  }
  private pollX11() {
    if (this.polling) return this.polling;
    this.polling = this.queryX11().finally(() => {
      this.polling = undefined;
    });
    return this.polling;
  }
  private async queryX11() {
    try {
      const active = (
        await exec("xdotool", ["getactivewindow"], { timeout: 1000 })
      ).stdout.trim();
      const prop = (
        await exec("xprop", ["-id", active, "_NET_WM_PID"], { timeout: 1000 })
      ).stdout;
      const pid = prop.match(/=\s*(\d+)/)?.[1];
      if (pid === String(process.pid)) {
        this.invalidate();
        return;
      }
      const name = pid
        ? (
            await exec("ps", ["-p", pid, "-o", "comm="], { timeout: 1000 })
          ).stdout.trim()
        : "unknown";
      const text = (
        await exec("xclip", ["-o", "-selection", "primary"], {
          timeout: 1000,
          maxBuffer: 400000,
        })
      ).stdout;
      const stillActive = (
        await exec("xdotool", ["getactivewindow"], { timeout: 1000 })
      ).stdout.trim();
      if (stillActive !== active) {
        this.invalidate();
        return;
      }
      this.setStatus("X11 PRIMARY 选区已连接", "ready");
      const key = active + ":" + text;
      if (!text.trim() || text.length > 100000) {
        this.invalidate();
        return;
      }
      if (key === this.last) return;
      this.last = key;
      const pos = (
        await exec("xdotool", ["getmouselocation", "--shell"], {
          timeout: 1000,
        })
      ).stdout;
      this.current = {
        token: randomUUID(),
        text,
        app: name,
        x: Number(pos.match(/X=(\d+)/)?.[1] ?? 0),
        y: Number(pos.match(/Y=(\d+)/)?.[1] ?? 0),
        canReplace: false,
      };
      this.emit("selection", this.current);
    } catch {
      this.setStatus(
        "X11 选区不可用：请安装 xclip、xdotool、xprop，或框选取词/读取剪贴板",
        "error",
      );
      this.invalidate();
    }
  }
  async readCurrent(
    onJavaBridgeUnavailable?: () => void,
  ): Promise<Selection | undefined> {
    if (this.platform === "linux") {
      if (
        process.env.XDG_SESSION_TYPE === "wayland" ||
        process.env.WAYLAND_DISPLAY
      ) {
        this.invalidate();
        return;
      }
      // Wait for a background poll, then issue a new query for this key press.
      if (this.polling) await this.polling;
      await this.pollX11();
      return this.current;
    }
    if (
      this.recovering ||
      !this.child ||
      this.child.killed ||
      !this.child.stdin.writable
    ) {
      this.invalidate();
      return;
    }
    return new Promise((resolve) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.diagnose({
          event: "read_timeout",
          probe: this.probe,
          elapsedMs: 1800,
        });
        this.reads.delete(id);
        this.invalidate();
        resolve(undefined);
      }, 1800);
      this.reads.set(id, { resolve, onJavaBridgeUnavailable, timer });
      this.child!.stdin.write(
        JSON.stringify({ op: "refresh", id }) + "\n",
        (error) => {
          if (error && this.reads.has(id)) this.finishReads();
        },
      );
    });
  }
  private finishReads() {
    for (const pending of this.reads.values()) {
      clearTimeout(pending.timer);
      pending.resolve(undefined);
    }
    this.reads.clear();
  }
  setToolbarBounds(bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    if (this.platform === "darwin" && this.child?.stdin.writable)
      this.child.stdin.write(
        JSON.stringify({ op: "toolbarBounds", ...bounds }) + "\n",
      );
  }
  invalidate() {
    this.current = undefined;
    this.last = "";
    this.emit("invalid");
  }
  replace(token: string, text: string) {
    if (!this.current?.canReplace || this.current.token !== token)
      throw Error("原选区已失效，请复制结果");
    return new Promise<void>((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.diagnose({
          event: "replace_timeout",
          probe: this.probe,
          elapsedMs: 3000,
        });
        this.requests.delete(id);
        reject(Error("替换未确认，请检查目标内容，勿重复操作"));
      }, 3000);
      this.requests.set(id, { resolve, reject, timer });
      this.child?.stdin.write(
        JSON.stringify({ op: "replace", id, token, text }) + "\n",
      );
    });
  }
  stop() {
    this.running = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = undefined;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.stopWatchdog();
    const child = this.child;
    this.child = undefined;
    child?.kill();
    this.finishRequests("应用已关闭");
    this.finishReads();
    this.invalidate();
  }
  private finishRequests(message: string) {
    for (const pending of this.requests.values()) {
      clearTimeout(pending.timer);
      pending.reject(Error(message));
    }
    this.requests.clear();
  }
  private stopWatchdog() {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = undefined;
    this.stalled = false;
  }
}
