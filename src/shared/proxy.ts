import { z } from "zod";

export const proxyAddressError =
  "请输入 HTTP、HTTPS、SOCKS4 或 SOCKS5 代理地址，不含账号、密码、路径或查询参数";

export function proxyAddress(value: string): string {
  const text = value.trim();
  const u = new URL(text);
  if (
    !/^(https?|socks[45]):\/\//i.test(text) ||
    /[\s,;=]/.test(text) ||
    !u.hostname ||
    u.username ||
    u.password ||
    (u.pathname && u.pathname !== "/") ||
    u.search ||
    u.hash ||
    u.port === "0"
  )
    throw Error(proxyAddressError);
  const port =
    u.port ||
    (u.protocol === "http:" ? "80" : u.protocol === "https:" ? "443" : "1080");
  return `${u.protocol}//${u.hostname}:${port}`;
}

export function validProxyAddress(value: string) {
  try {
    proxyAddress(value);
    return true;
  } catch {
    return false;
  }
}

export const ProxySchema = z.strictObject({
  mode: z.enum(["system", "direct", "custom"]),
  // An empty draft can autosave; custom requests fail closed until an address is supplied.
  address: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => !value || validProxyAddress(value), proxyAddressError),
});
export type ProviderProxy = z.infer<typeof ProxySchema>;
export const defaultProxy = (): ProviderProxy => ({
  mode: "system",
  address: "",
});
