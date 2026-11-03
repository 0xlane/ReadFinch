import { t } from "../shared/i18n";
import {
  type ProviderProxy,
  validProxyAddress,
  proxyAddressError,
} from "../shared/proxy";
import { Field } from "./ui";

export function ProviderProxySettings({
  value,
  onChange,
}: {
  value: ProviderProxy;
  onChange: (proxy: ProviderProxy) => void;
}) {
  const invalid = !!value.address.trim() && !validProxyAddress(value.address);
  return (
    <div className="provider-proxy">
      <Field
        label={t("代理")}
        hint={t(
          value.mode === "system"
            ? "跟随操作系统的代理设置。"
            : value.mode === "direct"
              ? "此提供商直接连接，不使用系统代理。"
              : "仅此提供商使用指定代理，连接失败时不会改为直连。",
        )}
      >
        <select
          aria-label={t("提供商代理")}
          value={value.mode}
          onChange={(e) =>
            onChange({
              ...value,
              mode: e.target.value as ProviderProxy["mode"],
            })
          }
        >
          <option value="system">{t("使用全局代理")}</option>
          <option value="direct">{t("禁用代理")}</option>
          <option value="custom">{t("自定义代理")}</option>
        </select>
      </Field>
      {value.mode === "custom" && (
        <Field
          label={t("代理地址")}
          hint={t("支持无需认证的 HTTP、HTTPS、SOCKS4、SOCKS5 代理。")}
        >
          <input
            aria-label={t("代理地址")}
            aria-invalid={invalid}
            type="url"
            maxLength={2048}
            placeholder="http://127.0.0.1:7890"
            value={value.address}
            onChange={(e) => onChange({ ...value, address: e.target.value })}
            onBlur={() => {
              if (value.address !== value.address.trim())
                onChange({ ...value, address: value.address.trim() });
            }}
          />
          {invalid && (
            <small className="provider-proxy-error" role="alert">
              {t(proxyAddressError)}
            </small>
          )}
        </Field>
      )}
    </div>
  );
}
