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
const exec = promisify(execFile);
export class SelectionService extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;
  private timer?: ReturnType<typeof setInterval>;
  private last = "";
  private polling?: Promise<void>;
  private heartbeat = Date.now();
  private watchdog?: ReturnType<typeof setInterval>;
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
  constructor(private nativeRoot: string) {
    super();
  }
  start() {
    if (process.platform === "linux") {
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
    const binary = path.join(
      this.nativeRoot,
      "bin",
      process.platform === "win32"
        ? "readfinch-selection.exe"
        : "readfinch-selection",
    );
    this.child = spawn(binary, [String(process.pid)], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "";
    this.child.stdout.setEncoding("utf8");
    this.child.stdin.on("error", () => this.finishReads());
    this.child.stdout.on("data", (chunk: string) => {
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
    this.child.on("error", () => {
      this.setStatus(
        "选区助手未启动；可框选取词或读取剪贴板，重启后重试",
        "error",
      );
      this.invalidate();
      this.finishReads();
    });
    this.child.on("exit", () => {
      if (this.state !== "error")
        this.setStatus(
          "选区助手已停止；可框选取词或读取剪贴板，重启后重试",
          "error",
        );
      this.invalidate();
      this.finishReads();
    });
    this.watchdog = setInterval(() => {
      if (Date.now() - this.heartbeat > 10000) {
        this.stalled = true;
        this.setStatus(
          "目标应用的辅助功能响应超时；可框选取词或读取剪贴板",
          "error",
        );
        this.invalidate();
      }
    }, 3000);
  }
  private receive(event: any) {
    this.heartbeat = Date.now();
    if (this.stalled && event.type !== "error") {
      this.stalled = false;
      this.setStatus(this.connectedMessage, "ready");
    }
    if (event.type === "ready") {
      this.connectedMessage = event.message;
      this.setStatus(event.message, "ready");
    }
    if (event.type === "error") this.setStatus(event.message, "error");
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
    if (process.platform === "linux") {
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
    if (!this.child || this.child.killed || !this.child.stdin.writable) {
      this.invalidate();
      return;
    }
    return new Promise((resolve) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.reads.delete(id);
        this.invalidate();
        resolve(undefined);
      }, 1800);
      this.reads.set(id, { resolve, onJavaBridgeUnavailable, timer });
      this.child!.stdin.write(
        JSON.stringify({ op: "refresh", id }) + "\n",
        (error) => {
          if (error) this.finishReads();
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
    if (this.timer) clearInterval(this.timer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.child?.kill();
    for (const pending of this.requests.values()) {
      clearTimeout(pending.timer);
      pending.reject(Error("应用已关闭"));
    }
    this.requests.clear();
    this.finishReads();
  }
}
