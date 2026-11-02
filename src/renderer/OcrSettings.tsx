import { t } from "../shared/i18n";
import { ScanLine, ExternalLink } from "lucide-react";
import { ocrProfiles, OFFLINE_OCR_ID, type Config } from "../shared/config";
import { ProviderSelect } from "./ProviderSelect";
import { Field, Badge } from "./ui";
export function OcrSettings({
  config,
  onChange,
  ready,
  busy,
  test,
  result,
  complete,
}: {
  config: Config;
  onChange: (c: Config) => void;
  ready: boolean;
  busy: boolean;
  test: (id: string) => void;
  result: string;
  complete: boolean;
}) {
  const profiles = ocrProfiles(config);
  const selected =
    profiles.find((p) => p.id === config.defaults.ocrProfileId) ?? profiles[0];
  const english = /TextHop\s*OCR\s*123/i.test(result);
  const chinese = /你好[\p{P}\s]*世界/u.test(result.replace(/\s+/g, ""));
  return (
    <>
      <section className="provider-config-section ocr-providers">
        <h2>{t("识别提供商")}</h2>
        <div className="provider-config-row">
          <div>
            <h3>{t("截图识别（OCR）")}</h3>
            <p>{t("框选无法选择的文字，识别后可校对、翻译或查词。")}</p>
          </div>
          <ProviderSelect
            config={config}
            label={t("OCR 提供商")}
            value={selected.kind === "offline" ? null : selected.id}
            emptyLabel={t("内置离线 OCR")}
            vision
            onChange={(id) =>
              onChange({
                ...config,
                defaults: {
                  ...config.defaults,
                  ocrProfileId: id ?? OFFLINE_OCR_ID,
                },
              })
            }
          />
        </div>
        <div className="ocr-provider-details">
          <div className="detection-status">
            <i />
            {selected.kind === "offline"
              ? t("本机识别 · English + 简体中文")
              : selected.name + " · " + selected.model}
          </div>
          <p>
            {selected.kind === "offline"
              ? t("中英文识别已随应用内置，框选后自动在本机处理。")
              : t("截图先在本机预览，点击识别后发送给所选提供商。")}
          </p>
          {!ready && selected.kind === "offline" && (
            <p role="alert">
              {t("内置 OCR 资源缺失或损坏，请重新安装 TextHop。")}
            </p>
          )}
          <button
            className="provider-help-link"
            onClick={() =>
              void window.texthop.call("settingsOpen", { tab: "text" })
            }
          >
            {t("管理 API 提供商")} <ExternalLink size={12} />
          </button>
        </div>
        {selected.kind === "openai" && (
          <details className="provider-advanced">
            <summary>{t("识别指令")}</summary>
            <Field label={t("识别指令")}>
              <textarea
                rows={4}
                value={selected.instruction}
                onChange={(e) =>
                  onChange({
                    ...config,
                    providers: config.providers.map((p) =>
                      p.id === selected.id
                        ? { ...p, instruction: e.target.value }
                        : p,
                    ),
                  })
                }
              />
            </Field>
          </details>
        )}
      </section>
      <section className="settings-card">
        <div className="section-heading">
          <div>
            <h3>{t("识别测试")}</h3>
            <p>
              {selected.kind === "offline" ? t(selected.name) : selected.name}
              {selected.kind === "openai"
                ? " · " + selected.model
                : t(" · 无需联网")}
            </p>
          </div>
        </div>
        <button
          className="secondary"
          disabled={busy || (selected.kind === "offline" && !ready)}
          onClick={() => test(selected.id)}
        >
          <ScanLine size={15} />
          {t("用样例图片测试")}
        </button>
        <p className="helper">
          {t("使用应用生成的中英文样例，不读取你的屏幕。")}
          {selected.kind === "openai"
            ? t(
                "测试图片将发送给「{0}」；接口兼容仍需模型具备图片输入能力。",
                selected.name,
              )
            : t("离线测试不会上传图片。")}
        </p>
        {result && (
          <div className="ocr-test-result">
            <h3>{t("识别结果")}</h3>
            <pre className="prompt-preview">{result}</pre>
            {complete && (
              <Badge tone={english && chinese ? "green" : "amber"}>
                {english && chinese
                  ? t("中英文均已识别")
                  : english
                    ? t("仅识别出英文校验文字")
                    : chinese
                      ? t("仅识别出中文校验文字")
                      : t("未识别校验文字，请检查模型的图片能力")}
              </Badge>
            )}
          </div>
        )}
      </section>
    </>
  );
}
