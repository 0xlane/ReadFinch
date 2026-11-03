import { session, type Session } from "electron";
import { createHash } from "node:crypto";
import { defaultProxy, proxyAddress } from "../shared/proxy";
import { t } from "../shared/i18n";
import { ProviderError, type ProviderTransport } from "../core/providers";

const routes = new Map<string, Promise<Session>>();

// Each provider/route gets an immutable, memory-only session. Switching settings
// cannot reroute another provider or reuse a socket opened through a previous proxy.
export const providerFetch: ProviderTransport = async (url, init, profile) => {
  const proxy = profile.proxy ?? defaultProxy();
  let selected: Session;
  if (proxy.mode === "system") {
    selected = session.defaultSession;
  } else {
    let address = "";
    if (proxy.mode === "custom") {
      if (!proxy.address.trim())
        throw new ProviderError("proxy", t("请先填写此提供商的自定义代理地址"));
      address = proxyAddress(proxy.address);
    }
    const route = createHash("sha256")
      .update(JSON.stringify([profile.id, proxy.mode, address]))
      .digest("hex");
    let ready = routes.get(route);
    if (!ready) {
      const isolated = session.fromPartition("provider-network-" + route, {
        cache: false,
      });
      ready = isolated
        .setProxy(
          proxy.mode === "direct"
            ? { mode: "direct" }
            : {
                mode: "fixed_servers",
                proxyRules: address,
                // An explicit custom proxy also applies to local API endpoints.
                proxyBypassRules: "<-loopback>",
              },
        )
        .then(() => isolated);
      routes.set(route, ready);
      void ready.catch(() => routes.delete(route));
    }
    selected = await ready;
  }
  init.signal?.throwIfAborted();
  return selected.fetch(url, {
    ...init,
    credentials: "omit",
    cache: "no-store",
    bypassCustomProtocolHandlers: true,
  });
};
