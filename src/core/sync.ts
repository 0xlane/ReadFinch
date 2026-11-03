import { t } from "../shared/i18n";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { parseConfig, type Config } from "../shared/config";
import { atomicWrite, readJson, digest, ConfigStore } from "./store";
import type { SyncResult } from "../shared/api";
export type DavSettings = {
  enabled: boolean;
  url: string;
  username: string;
  remotePath: string;
};
type Baseline = {
  hash: string;
  etag: string;
  lastSync: string;
  endpoint: string;
};
type Remote = { config: Config; etag: string } | null;
type Conflict = {
  token: string;
  localHash: string;
  remoteHash: string;
  etag: string;
  remote: Remote;
  endpoint: string;
};
function strong(etag: string | null): etag is string {
  return !!etag && /^"[^"\r\n]+"$/.test(etag);
}
export function davUrl(settings: DavSettings) {
  const base = new URL(
    settings.url.endsWith("/") ? settings.url : settings.url + "/",
  );
  if (
    !["https:", "http:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw Error(t("WebDAV 地址无效，凭据请单独填写"));
  if (
    !settings.remotePath ||
    settings.remotePath.split("/").some((s) => s === ".." || s === ".") ||
    /[?#\\]/.test(settings.remotePath) ||
    settings.remotePath.startsWith("/")
  )
    throw Error(t("远程位置须为相对文件路径，例如 ReadFinch/config.json"));
  return new URL(
    settings.remotePath.split("/").map(encodeURIComponent).join("/"),
    base,
  ).toString();
}
export class DavSync {
  private busy = false;
  private connection?: {
    endpoint: string;
    username: string;
    password?: string;
  };
  private pending?: Conflict;
  constructor(
    private store: ConfigStore,
    private settings: () => DavSettings,
    private password: () => Promise<string | undefined>,
  ) {}
  get stateFile() {
    return path.join(this.store.dir, "sync-baseline.json");
  }
  async state() {
    return readJson<Baseline | null>(this.stateFile, null);
  }
  private async withConnection<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) throw Error(t("同步或连接测试正在进行，请稍后"));
    this.busy = true;
    try {
      // A setting change in another window must never redirect an in-flight write.
      const s = { ...this.settings() };
      const endpoint = davUrl(s);
      const password = await this.password();
      this.connection = { endpoint, username: s.username, password };
      return await operation();
    } finally {
      this.connection = undefined;
      this.busy = false;
    }
  }
  private get endpoint() {
    if (!this.connection) throw Error(t("同步连接尚未建立"));
    return this.connection.endpoint;
  }
  private async http(
    method: string,
    headers: Record<string, string> = {},
    body?: string,
  ) {
    const s = this.connection!;
    const pass = s.password;
    if (s.username && !pass) throw Error(t("请填写 WebDAV 密码或应用密码"));
    let res;
    try {
      res = await fetch(s.endpoint, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        headers: {
          ...(s.username
            ? {
                Authorization:
                  "Basic " +
                  Buffer.from(s.username + ":" + pass).toString("base64"),
              }
            : {}),
          ...headers,
        },
        body,
      });
    } catch {
      throw Error(t("无法连接 WebDAV，或传输中断。有效配置保持不变。"));
    }
    if (res.status === 401 || res.status === 403)
      throw Error(t("WebDAV 认证失败，请检查账号、应用密码和写入权限"));
    if (res.status === 412)
      throw Error(t("远程配置刚刚发生变化，请重新同步并解决冲突"));
    return res;
  }
  private async read(): Promise<Remote> {
    const res = await this.http("GET");
    if (res.status === 404) return null;
    if (!res.ok) throw Error(t("WebDAV 读取失败（HTTP {0}）", res.status));
    if (Number(res.headers.get("content-length")) > 2_000_000)
      throw Error(t("远程配置文件超过 2 MB"));
    if (!res.body) throw Error(t("远程配置响应为空"));
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of res.body) {
      bytes += chunk.length;
      if (bytes > 2_000_000) throw Error(t("远程配置文件超过 2 MB"));
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    const config = parseConfig(text);
    return { config, etag: res.headers.get("etag") ?? "" };
  }
  async test() {
    return this.withConnection(async () => {
      const remote = await this.read();
      return remote
        ? strong(remote.etag)
          ? t("连接成功，配置有效，服务提供强 ETag。写入能力将在同步时验证。")
          : t("连接成功，但缺少强 ETag；为保护配置，上传已禁用。")
        : t("连接成功，远程文件尚不存在。请确保父目录已创建。");
    });
  }
  private async baseline(config: Config, etag: string) {
    await atomicWrite(
      this.stateFile,
      JSON.stringify({
        hash: digest(config),
        etag,
        lastSync: new Date().toISOString(),
        endpoint: this.endpoint,
      }),
    );
  }
  private async conflict(
    local: Config,
    remote: Remote,
    message: string,
  ): Promise<SyncResult> {
    const token = randomUUID();
    this.pending = {
      token,
      localHash: digest(local),
      remoteHash: remote ? digest(remote.config) : "missing",
      etag: remote?.etag ?? "",
      remote,
      endpoint: this.endpoint,
    };
    await this.store.backup("conflict-local", local);
    if (remote) await this.store.backup("conflict-remote", remote.config);
    return {
      status: "conflict",
      message,
      token,
      local,
      remote: remote?.config,
      remoteDeleted: !remote,
    };
  }
  private async upload(config: Config, remote: Remote) {
    if (remote && !strong(remote.etag))
      return {
        status: "limited",
        message: t(
          "服务器没有提供强 ETag，无法保证安全更新。上传已停止；可明确选择使用远程配置，或换用支持条件写入的服务器。",
        ),
      } as SyncResult;
    const before = this.store.revision;
    const res = await this.http(
      "PUT",
      {
        "Content-Type": "application/json; charset=utf-8",
        ...(remote ? { "If-Match": remote.etag } : { "If-None-Match": "*" }),
      },
      JSON.stringify(config, null, 2),
    );
    if (!res.ok)
      throw Error(
        t("WebDAV 写入失败（HTTP {0}），请检查父目录和写入权限", res.status),
      );
    const verified = await this.read();
    if (!verified || digest(verified.config) !== digest(config))
      throw Error(t("上传后的远程校验失败，未记录同步基线；请重新同步"));
    if (!strong(verified.etag))
      throw Error(t("服务器未返回强 ETag，后续上传将被禁用"));
    await this.baseline(config, verified.etag);
    this.pending = undefined;
    return {
      status: "synced",
      message:
        before === this.store.revision
          ? t("配置已上传，其他设备可同步获取。")
          : t("上传完成；本机有新的修改，需再次同步。"),
    } as SyncResult;
  }
  private async download(remote: Remote, revision: string) {
    if (!remote)
      throw Error(t("远程文件已删除。可保留本机配置并重新创建远程文件。"));
    // Re-read immediately before committing. No timestamp is trusted as a version.
    const latest = await this.read();
    if (
      !latest ||
      latest.etag !== remote.etag ||
      digest(latest.config) !== digest(remote.config)
    )
      throw Error(t("远程配置再次变化，请重新同步"));
    await this.store.backup("before-download");
    await this.store.save(remote.config, revision);
    await this.baseline(remote.config, remote.etag);
    this.pending = undefined;
    return {
      status: "synced",
      message: t("已应用远程配置；此前的本机配置已备份。"),
    } as SyncResult;
  }
  async sync(
    resolution?: "local" | "remote",
    token?: string,
  ): Promise<SyncResult> {
    if (!this.settings().enabled) throw Error(t("请先启用 WebDAV 同步"));
    return this.withConnection(async () => {
      const local = this.store.config;
      const revision = this.store.revision;
      const remote = await this.read();
      const stored = await this.state();
      const baseline = stored?.endpoint === this.endpoint ? stored : null;
      if (resolution) {
        const p = this.pending;
        if (
          !p ||
          p.token !== token ||
          p.endpoint !== this.endpoint ||
          p.localHash !== revision ||
          p.remoteHash !== (remote ? digest(remote.config) : "missing") ||
          p.etag !== (remote?.etag ?? "")
        )
          return this.conflict(
            local,
            remote,
            t("解决冲突前配置发生变化，请重新选择。"),
          );
        return resolution === "local"
          ? await this.upload(local, remote)
          : await this.download(remote, revision);
      }
      if (remote && digest(remote.config) === revision) {
        await this.baseline(local, remote.etag);
        return { status: "synced", message: t("本机与远程配置一致。") };
      }
      if (!baseline) {
        if (!remote) return this.upload(local, null);
        return this.conflict(
          local,
          remote,
          t("首次同步：本机和远程都有配置，请选择保留哪一份。"),
        );
      }
      if (!remote)
        return this.conflict(
          local,
          null,
          t("远程配置文件已被删除。保留本机将重新创建远程文件。"),
        );
      const localChanged = revision !== baseline.hash;
      const remoteChanged = digest(remote.config) !== baseline.hash;
      if (localChanged && remoteChanged)
        return this.conflict(
          local,
          remote,
          t("两台设备都修改了配置（包括删除项），已保存双方备份。"),
        );
      if (remoteChanged) return this.download(remote, revision);
      if (localChanged) {
        if (!strong(remote.etag))
          return this.conflict(
            local,
            remote,
            t("服务器没有强 ETag；安全上传不可用。可选择使用远程配置。"),
          );
        return this.upload(local, remote);
      }
      return { status: "synced", message: t("配置无需更新。") };
    });
  }
}
