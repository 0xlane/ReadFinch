import type { UpdateState, UpdateSource, UpdateKind } from "../shared/updates";
import {
  newerVersion,
  releaseFile,
  UpdateFailure,
  type ReleaseManifest,
  type ReleaseFile,
} from "./update-manifest";

export interface UpdateDriver {
  manifest(
    signal: AbortSignal,
    sourceChanged: (source: UpdateSource) => void,
  ): Promise<{ manifest: ReleaseManifest; source: UpdateSource }>;
  download(
    manifest: ReleaseManifest,
    file: ReleaseFile,
    source: UpdateSource,
    signal: AbortSignal,
    progress: (value: NonNullable<UpdateState["progress"]>) => void,
  ): Promise<void>;
  setAutomatic(value: boolean): void;
  install(): Promise<void>;
}
export class UpdateService {
  state: UpdateState;
  private release?: ReleaseManifest;
  private file?: ReleaseFile;
  private operation?: Promise<UpdateState>;
  private controller?: AbortController;
  private automaticOperation = false;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  constructor(
    private readonly options: {
      version: string;
      platform: string;
      arch: string;
      kind: UpdateKind;
      installMode: UpdateState["installMode"];
      automatic: boolean;
      driver: UpdateDriver;
      changed: (state: UpdateState) => void;
      now?: () => number;
    },
  ) {
    this.state = {
      status: "idle",
      automatic: options.automatic,
      currentVersion: options.version,
      platform: options.platform,
      arch: options.arch,
      installMode: options.installMode,
      source: "github",
    };
    options.driver.setAutomatic(options.automatic);
  }
  private update(value: Partial<UpdateState>) {
    this.state = { ...this.state, ...value };
    this.options.changed(this.state);
  }
  start(delay = 20000) {
    clearTimeout(this.timer);
    if (
      this.stopped ||
      !this.state.automatic ||
      this.state.installMode === "development"
    )
      return;
    this.timer = setTimeout(() => {
      void this.check(true).finally(() => this.start(4 * 60 * 60 * 1000));
    }, delay);
    this.timer.unref?.();
  }
  setAutomatic(value: boolean) {
    this.update({ automatic: value });
    this.options.driver.setAutomatic(value);
    if (!value && this.automaticOperation) this.controller?.abort();
    this.start();
    return this.state;
  }
  check(automatic = false): Promise<UpdateState> {
    if (this.operation) return this.operation;
    if (
      this.state.status === "downloaded" ||
      this.state.status === "installing"
    )
      return Promise.resolve(this.state);
    if (this.state.installMode === "development") {
      this.update({ status: "error", error: "开发环境不会下载或安装更新。" });
      return Promise.resolve(this.state);
    }
    return this.run(automatic, async (signal) => {
      this.update({
        status: "checking",
        source: "github",
        checkedAt: new Date((this.options.now ?? Date.now)()).toISOString(),
        error: undefined,
        progress: undefined,
      });
      const result = await this.options.driver.manifest(signal, (source) =>
        this.update({ source }),
      );
      if (signal.aborted) return;
      this.update({
        checkedAt: new Date((this.options.now ?? Date.now)()).toISOString(),
      });
      if (!newerVersion(result.manifest.version, this.state.currentVersion)) {
        this.release = undefined;
        this.file = undefined;
        this.update({
          status: "latest",
          availableVersion: undefined,
          releaseDate: undefined,
          notes: undefined,
        });
        return;
      }
      this.file = releaseFile(
        result.manifest,
        this.options.platform,
        this.options.arch,
        this.options.kind,
      );
      this.release = result.manifest;
      this.update({
        status: "available",
        availableVersion: this.release.version,
        releaseDate: this.release.publishedAt,
        notes: this.release.notes,
      });
      if (this.state.automatic) {
        this.automaticOperation = true;
        await this.performDownload(signal);
      }
    });
  }
  download(): Promise<UpdateState> {
    if (this.operation) return this.operation;
    if (!this.release || !this.file) return this.check();
    if (this.state.status === "downloaded") return Promise.resolve(this.state);
    return this.run(false, (signal) => this.performDownload(signal));
  }
  private async performDownload(signal: AbortSignal) {
    if (!this.release || !this.file) return;
    // Always try the original GitHub asset first, even when the manifest was
    // fetched through the proxy. The signed bytes and hashes remain unchanged.
    for (const source of ["github", "gh-proxy"] as const) {
      this.update({
        status: "downloading",
        source,
        error: undefined,
        progress: {
          percent: 0,
          transferred: 0,
          total: this.file.size,
          bytesPerSecond: 0,
        },
      });
      try {
        await this.options.driver.download(
          this.release,
          this.file,
          source,
          signal,
          (progress) => {
            if (!signal.aborted) this.update({ progress });
          },
        );
        if (signal.aborted) return;
        this.update({ status: "downloaded", progress: undefined });
        return;
      } catch (error) {
        if (signal.aborted) throw error;
        if (source === "gh-proxy")
          throw new UpdateFailure(
            "更新下载失败，请重试或前往 GitHub Releases 下载。",
          );
      }
    }
  }
  private run(
    automatic: boolean,
    task: (signal: AbortSignal) => Promise<void>,
  ) {
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.automaticOperation = automatic;
    this.operation = task(signal)
      .catch((error) => {
        this.update({
          status: signal.aborted
            ? this.release
              ? "available"
              : "idle"
            : "error",
          progress: undefined,
          error: signal.aborted
            ? undefined
            : error instanceof UpdateFailure
              ? error.messageKey
              : "更新操作失败，请稍后重试。",
        });
      })
      .then(() => this.state)
      .finally(() => {
        this.operation = undefined;
        this.controller = undefined;
        this.automaticOperation = false;
      });
    return this.operation;
  }
  async install() {
    if (this.state.status !== "downloaded")
      throw new UpdateFailure("更新尚未下载完成。");
    this.update({ status: "installing", error: undefined });
    try {
      await this.options.driver.install();
      if (this.state.installMode === "manual")
        this.update({ status: "downloaded" });
    } catch (error) {
      this.update({
        status: "downloaded",
        error:
          error instanceof UpdateFailure
            ? error.messageKey
            : "无法启动安装程序，请前往 GitHub Releases 下载。",
      });
    }
    return this.state;
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.controller?.abort();
  }
}
