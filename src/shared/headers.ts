import { t } from "./i18n";
export function parseHeaders(value: string): Record<string, string> {
  if (!value.trim()) return {};
  let entries: unknown;
  try {
    entries = JSON.parse(value);
  } catch {
    throw Error(t("请求头须为有效的 JSON 对象"));
  }
  if (
    !entries ||
    typeof entries !== "object" ||
    Array.isArray(entries) ||
    value.length > 16000
  )
    throw Error(t("请求头须为不超过 16 KB 的 JSON 对象"));
  const names = new Set<string>();
  for (const [key, v] of Object.entries(entries)) {
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) ||
      typeof v !== "string" ||
      /[^\t\x20-\x7e\x80-\xff]/.test(v)
    )
      throw Error(t("请求头的名称或值无效"));
    const name = key.toLowerCase();
    if (
      names.has(name) ||
      [
        "host",
        "connection",
        "transfer-encoding",
        "content-length",
        "upgrade",
        "proxy-authorization",
        "proxy-connection",
        "keep-alive",
        "expect",
        "trailer",
      ].includes(name)
    )
      throw Error(t("请求头名称重复或由传输层管理"));
    names.add(name);
  }
  return entries as Record<string, string>;
}
