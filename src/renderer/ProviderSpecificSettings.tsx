import type { TextProfile } from "../shared/config";
import { Field } from "./ui";
import { t } from "../shared/i18n";

export function ProviderSpecificSettings({
  provider,
  change,
}: {
  provider: TextProfile;
  change: (patch: Partial<TextProfile>) => void;
}) {
  const settings = provider.providerSettings ?? {};
  function update(
    patch: NonNullable<TextProfile["providerSettings"]>,
    endpoint = provider.endpoint,
  ) {
    change({ providerSettings: { ...settings, ...patch }, endpoint });
  }
  if (provider.preset === "bedrock")
    return (
      <Field
        label={t("AWS 区域")}
        hint={t("API Key、模型访问权限和区域应保持一致。")}
      >
        <input
          aria-label={t("AWS 区域")}
          placeholder="us-east-1"
          value={settings.region ?? ""}
          onChange={(e) => {
            const region = e.target.value.trim();
            const official =
              /^https:\/\/bedrock-runtime\.[a-z0-9-]+\.amazonaws\.com\/?$/.test(
                provider.endpoint,
              );
            update(
              { region: region || undefined },
              official && /^[a-z0-9-]+$/.test(region)
                ? "https://bedrock-runtime." + region + ".amazonaws.com"
                : provider.endpoint,
            );
          }}
        />
      </Field>
    );
  if (provider.preset !== "azure") return null;
  return (
    <div className="provider-specific-settings">
      <Field
        label={t("Azure 资源名称")}
        hint={t("使用自定义 Base URL 时可留空；模型字段填写部署 ID。")}
      >
        <input
          aria-label={t("Azure 资源名称")}
          placeholder="my-azure-resource"
          value={settings.resourceName ?? ""}
          onChange={(e) => {
            const resourceName = e.target.value.trim();
            const official =
              /^https:\/\/[\w-]+\.openai\.azure\.com\/openai(?:\/v1)?\/?$/.test(
                provider.endpoint,
              );
            update(
              { resourceName: resourceName || undefined },
              official && /^[a-zA-Z0-9-]+$/.test(resourceName)
                ? "https://" +
                    resourceName +
                    ".openai.azure.com/openai" +
                    ((settings.apiVersion ?? "v1") === "v1" ? "/v1" : "")
                : provider.endpoint,
            );
          }}
        />
      </Field>
      <div className="provider-specific-pair">
        <Field label={t("API 模式")}>
          <select
            aria-label={t("API 模式")}
            value={settings.apiMode ?? "responses"}
            onChange={(e) =>
              update({ apiMode: e.target.value as "chat" | "responses" })
            }
          >
            <option value="responses">Responses</option>
            <option value="chat">Chat Completions</option>
          </select>
        </Field>
        <Field label={t("API 版本")}>
          <input
            aria-label={t("API 版本")}
            placeholder="v1"
            value={settings.apiVersion ?? ""}
            onChange={(e) => {
              const apiVersion = e.target.value.trim();
              const official =
                /^https:\/\/[\w-]+\.openai\.azure\.com\/openai(?:\/v1)?\/?$/.test(
                  provider.endpoint,
                );
              update(
                { apiVersion: apiVersion || undefined },
                official
                  ? provider.endpoint.replace(/\/v1\/?$/, "") +
                      ((apiVersion || "v1") === "v1" ? "/v1" : "")
                  : provider.endpoint,
              );
            }}
          />
        </Field>
      </div>
    </div>
  );
}
