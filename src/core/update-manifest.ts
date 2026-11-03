import { verify } from "node:crypto";
import { z } from "zod";
import {
  PROJECT_URL,
  UPDATE_MANIFEST,
  UPDATE_PROXY,
  type UpdateKind,
  type UpdateSource,
} from "../shared/updates";

const stableVersion = z
  .string()
  .regex(/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/);
export const ReleaseManifestSchema = z.strictObject({
  schema: z.literal(1),
  version: stableVersion,
  publishedAt: z.string().datetime(),
  notes: z.string().max(20000),
  files: z
    .array(
      z.strictObject({
        platform: z.enum(["win32", "darwin", "linux"]),
        arch: z.enum(["x64", "arm64"]),
        kind: z.enum(["nsis", "portable", "AppImage", "deb", "dmg"]),
        name: z
          .string()
          .max(180)
          .regex(/^ReadFinch-[a-zA-Z0-9._-]+$/),
        size: z
          .number()
          .int()
          .positive()
          .max(2 * 1024 ** 3),
        sha512: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
      }),
    )
    .min(1)
    .max(20),
});
export type ReleaseManifest = z.infer<typeof ReleaseManifestSchema>;
export type ReleaseFile = ReleaseManifest["files"][number];
export class UpdateFailure extends Error {
  constructor(public readonly messageKey: string) {
    super(messageKey);
  }
}
export function verifyManifest(
  bytes: Uint8Array,
  signature: string,
  publicKey: string,
): ReleaseManifest {
  if (
    bytes.byteLength > 128 * 1024 ||
    !/^[A-Za-z0-9+/]{86}==$/.test(signature.trim())
  )
    throw new UpdateFailure("更新清单校验失败，已停止更新。");
  let valid = false;
  try {
    valid = verify(
      null,
      bytes,
      publicKey,
      Buffer.from(signature.trim(), "base64"),
    );
  } catch {}
  if (!valid) throw new UpdateFailure("更新清单校验失败，已停止更新。");
  try {
    const result = ReleaseManifestSchema.parse(
      JSON.parse(Buffer.from(bytes).toString("utf8")),
    );
    const identities = new Set<string>();
    const extensions: Record<UpdateKind, string> = {
      nsis: ".exe",
      portable: ".exe",
      AppImage: ".AppImage",
      deb: ".deb",
      dmg: ".dmg",
    };
    for (const file of result.files) {
      const id = `${file.platform}/${file.arch}/${file.kind}`;
      if (
        identities.has(id) ||
        !file.name.startsWith(`ReadFinch-${result.version}-`) ||
        !file.name.endsWith(extensions[file.kind])
      )
        throw Error("Invalid asset");
      identities.add(id);
    }
    return result;
  } catch {
    throw new UpdateFailure(
      "更新清单格式不受支持，请前往 GitHub Releases 查看。",
    );
  }
}
export function newerVersion(candidate: string, current: string): boolean {
  const parsed = stableVersion.safeParse(candidate);
  const installed = /^(\d+)\.(\d+)\.(\d+)(?:-[\w.-]+)?$/.exec(current);
  if (!parsed.success || !installed) return false;
  const next = candidate.split(".").map(Number),
    old = installed.slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (next[i] !== old[i]) return next[i] > old[i];
  return current.includes("-");
}
export function releaseFile(
  manifest: ReleaseManifest,
  platform: string,
  arch: string,
  kind: UpdateKind,
): ReleaseFile {
  const file = manifest.files.find(
    (f) => f.platform === platform && f.arch === arch && f.kind === kind,
  );
  if (!file) throw new UpdateFailure("此版本尚未提供适合当前系统的安装包。");
  return file;
}
export function updateUrl(
  source: UpdateSource,
  version?: string,
  file = UPDATE_MANIFEST,
): string {
  const url = `${PROJECT_URL}/releases/${version ? "download/v" + version : "latest/download"}/${encodeURIComponent(file)}`;
  return source === "gh-proxy" ? UPDATE_PROXY + url : url;
}
export type UpdateFetch = (url: string, init: RequestInit) => Promise<Response>;
async function boundedResponse(
  response: Response,
  max: number,
): Promise<Uint8Array> {
  if (!response.ok || !response.body)
    throw new UpdateFailure("无法连接更新服务器，请稍后重试。");
  if (Number(response.headers.get("content-length")) > max)
    throw new UpdateFailure("更新清单校验失败，已停止更新。");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.length;
      if (length > max)
        throw new UpdateFailure("更新清单校验失败，已停止更新。");
      parts.push(result.value);
    }
    return Buffer.concat(parts);
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function fetchSignedManifest(
  fetcher: UpdateFetch,
  publicKey: string,
  sourceChanged: (source: UpdateSource) => void,
  signal?: AbortSignal,
): Promise<{ manifest: ReleaseManifest; source: UpdateSource }> {
  for (const source of ["github", "gh-proxy"] as const) {
    sourceChanged(source);
    try {
      const requestSignal = AbortSignal.any([
        AbortSignal.timeout(15000),
        ...(signal ? [signal] : []),
      ]);
      // Fetch both files from the same release route. If a release is promoted
      // between requests, the signature fails closed instead of trusting it.
      const response = await fetcher(updateUrl(source), {
        signal: requestSignal,
        cache: "no-store",
        credentials: "omit",
      });
      const bytes = await boundedResponse(response, 128 * 1024);
      const signature = await fetcher(
        updateUrl(source, undefined, UPDATE_MANIFEST + ".sig"),
        { signal: requestSignal, cache: "no-store", credentials: "omit" },
      );
      const rawSignature = await boundedResponse(signature, 256);
      return {
        manifest: verifyManifest(
          bytes,
          Buffer.from(rawSignature).toString("utf8"),
          publicKey,
        ),
        source,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      // A bad signature must never become an opportunity to try a different
      // origin. Only transport failures trigger the public proxy fallback.
      if (
        error instanceof UpdateFailure &&
        error.messageKey !== "无法连接更新服务器，请稍后重试。"
      )
        throw error;
      if (source === "gh-proxy")
        throw new UpdateFailure("无法连接更新服务器，请稍后重试。");
    }
  }
  throw new UpdateFailure("无法连接更新服务器，请稍后重试。");
}
