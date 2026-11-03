import { app, session, shell } from "electron";
import {
  NsisUpdater,
  AppImageUpdater,
  Provider,
  type AppUpdater,
} from "electron-updater";
import type { ProviderRuntimeOptions } from "electron-updater/out/providers/Provider";
import {
  CancellationToken,
  type UpdateInfo,
  type CustomPublishOptions,
} from "builder-util-runtime";
import { existsSync } from "node:fs";
import path from "node:path";
import { atomicWrite, readJson } from "../core/store";
import {
  fetchSignedManifest,
  updateUrl,
  UpdateFailure,
  type ReleaseManifest,
  type ReleaseFile,
} from "../core/update-manifest";
import {
  downloadVerifiedUpdate,
  verifyUpdateFile,
} from "../core/update-download";
import { UpdateService, type UpdateDriver } from "../core/update-service";
import type { UpdateState, UpdateSource, UpdateKind } from "../shared/updates";
import updateKey from "../shared/update-key.json";

// Only a verified manifest reaches this provider. No YAML or proxy-supplied
// arbitrary URL is passed to the installer engine.
class VerifiedProvider extends Provider<UpdateInfo> {
  constructor(
    private readonly options: CustomPublishOptions,
    _updater: AppUpdater,
    runtime: ProviderRuntimeOptions,
  ) {
    super({ ...runtime, isUseMultipleRangeRequest: false });
  }
  async getLatestVersion() {
    return this.options.info;
  }
  resolveFiles(info: UpdateInfo) {
    return info.files.map((file) => ({
      info: file,
      url: new URL(updateUrl(this.options.source, info.version, file.url)),
    }));
  }
}
class InstalledWindowsUpdater extends NsisUpdater {
  automatic(value: boolean) {
    this.autoInstallOnAppQuit = value;
    if (value && this.installerPath) this.addQuitHandler();
  }
}
class InstalledAppImageUpdater extends AppImageUpdater {
  automatic(value: boolean) {
    this.autoInstallOnAppQuit = value;
    if (value && this.installerPath) this.addQuitHandler();
  }
}
type InstallEngine = InstalledWindowsUpdater | InstalledAppImageUpdater;
function installation(): {
  mode: UpdateState["installMode"];
  kind: UpdateKind;
} {
  if (!app.isPackaged) return { mode: "development", kind: "nsis" };
  if (process.platform === "win32") {
    if (process.env.PORTABLE_EXECUTABLE_FILE)
      return { mode: "manual", kind: "portable" };
    return {
      mode: existsSync(
        path.join(path.dirname(process.execPath), "Uninstall ReadFinch.exe"),
      )
        ? "automatic"
        : "manual",
      kind: "nsis",
    };
  }
  if (process.platform === "linux")
    return process.env.APPIMAGE
      ? { mode: "automatic", kind: "AppImage" }
      : { mode: "manual", kind: "deb" };
  // Squirrel.Mac requires an Apple signing identity. The first release ships
  // ad-hoc signed DMGs, so it offers verified downloads and Finder handoff.
  return { mode: "manual", kind: "dmg" };
}
class DesktopUpdateDriver implements UpdateDriver {
  private engine?: InstallEngine;
  private file?: ReleaseFile;
  private downloaded?: string;
  private automatic = true;
  private readonly network = session.fromPartition("readfinch-updates", {
    cache: false,
  });
  private readonly fetch = (url: string, init: RequestInit) =>
    this.network.fetch(url, init);
  constructor(private readonly mode: UpdateState["installMode"]) {
    if (mode === "automatic") {
      this.engine =
        process.platform === "win32"
          ? new InstalledWindowsUpdater()
          : new InstalledAppImageUpdater();
      this.engine.autoDownload = false;
      this.engine.allowPrerelease = false;
      this.engine.allowDowngrade = false;
      this.engine.disableDifferentialDownload = true;
      this.engine.disableWebInstaller = true;
      this.engine.logger = null;
      this.engine.on("error", () => {}); // Failures are exposed through UpdateService, without raw URLs or headers.
    }
  }
  manifest(signal: AbortSignal, sourceChanged: (source: UpdateSource) => void) {
    return fetchSignedManifest(
      this.fetch,
      updateKey.publicKey,
      sourceChanged,
      signal,
    );
  }
  setAutomatic(value: boolean) {
    this.automatic = value;
    this.engine?.automatic(value);
  }
  async download(
    manifest: ReleaseManifest,
    file: ReleaseFile,
    source: UpdateSource,
    signal: AbortSignal,
    progress: (value: NonNullable<UpdateState["progress"]>) => void,
  ) {
    this.file = file;
    if (!this.engine) {
      this.downloaded = await downloadVerifiedUpdate({
        fetch: this.fetch,
        url: updateUrl(source, manifest.version, file.name),
        file,
        directory: path.join(app.getPath("userData"), "updates"),
        signal,
        progress,
      });
      return;
    }
    const engine = this.engine;
    engine.setFeedURL({
      provider: "custom",
      updateProvider: VerifiedProvider,
      info: {
        version: manifest.version,
        releaseDate: manifest.publishedAt,
        releaseNotes: manifest.notes,
        path: file.name,
        sha512: file.sha512,
        files: [{ url: file.name, size: file.size, sha512: file.sha512 }],
      },
      source,
    });
    const result = await engine.checkForUpdates();
    signal.throwIfAborted();
    if (!result || result.updateInfo.version !== manifest.version)
      throw new UpdateFailure("更新信息已变化，请重新检查更新。");
    const token = new CancellationToken();
    const abort = () => token.cancel();
    signal.addEventListener("abort", abort, { once: true });
    // electron-updater has a long transport timeout; use an inactivity limit
    // so an unreachable primary download falls back without a two-minute wait.
    let stall: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(stall);
      stall = setTimeout(() => token.cancel(), 30000);
      stall.unref?.();
    };
    const onProgress = (value: NonNullable<UpdateState["progress"]>) => {
      arm();
      progress(value);
    };
    engine.on("download-progress", onProgress);
    arm();
    try {
      const files = await engine.downloadUpdate(token);
      signal.throwIfAborted();
      this.downloaded = files[0];
      if (!this.downloaded || !(await verifyUpdateFile(this.downloaded, file)))
        throw new UpdateFailure("安装包校验失败，已停止更新。");
      engine.automatic(this.automatic);
    } finally {
      clearTimeout(stall!);
      signal.removeEventListener("abort", abort);
      engine.off("download-progress", onProgress);
    }
  }
  async install() {
    if (
      !this.downloaded ||
      !this.file ||
      !(await verifyUpdateFile(this.downloaded, this.file))
    )
      throw new UpdateFailure("安装包校验失败，已停止更新。");
    if (this.engine) {
      this.engine.quitAndInstall(true, true);
      return;
    }
    // Portable apps, unsigned macOS bundles, and package-manager installs have
    // an explicit handoff instead of an unsupported silent replacement.
    shell.showItemInFolder(this.downloaded);
  }
}
export class DesktopUpdates {
  service?: UpdateService;
  private saveQueue: Promise<unknown> = Promise.resolve();
  constructor(private readonly changed: (state: UpdateState) => void) {}
  get state(): UpdateState {
    return (
      this.service?.state ?? {
        status: "idle",
        automatic: true,
        currentVersion: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        installMode: "development",
        source: "github",
      }
    );
  }
  async init() {
    const file = path.join(app.getPath("userData"), "device-updates.json");
    const preferences = await readJson(file, { automatic: true }).catch(() => ({
      automatic: false,
    }));
    const install = installation();
    this.service = new UpdateService({
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      kind: install.kind,
      installMode: install.mode,
      automatic: preferences.automatic === true,
      driver: new DesktopUpdateDriver(install.mode),
      changed: this.changed,
    });
    this.service.start();
  }
  setAutomatic(automatic: boolean) {
    const operation = this.saveQueue
      .catch(() => {})
      .then(async () => {
        await atomicWrite(
          path.join(app.getPath("userData"), "device-updates.json"),
          JSON.stringify({ automatic }) + "\n",
        );
        return this.service!.setAutomatic(automatic);
      });
    this.saveQueue = operation;
    return operation;
  }
  stop() {
    this.service?.stop();
  }
}
