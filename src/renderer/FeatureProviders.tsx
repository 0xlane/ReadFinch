import { t } from "../shared/i18n";
import type { Config } from "../shared/config";
import { assignProvider, type ModelPurpose } from "../shared/models";
import { ProviderSelect } from "./ProviderSelect";

const descriptions: Record<string, string> = {
  translate: "翻译选区或校对后的截图文字。",
  dictionary: "查看释义、用法和例句。",
  sentence: "拆解句子结构，理解从句与修饰关系。",
  shorten: "精简选区内容，保留原意。",
  tone: "调整文字的语气和措辞。",
  explain: "用易懂的语言解释选区内容。",
  summarize: "从选区中提取摘要和要点。",
  error: "分析报错信息，给出排查步骤。",
  english: "改进英文表达，解释主要改动。",
  polish: "修改语法与措辞，并查看改动。",
};

export function FeatureProviders({
  config,
  purposes,
  onChange,
}: {
  config: Config;
  purposes: ModelPurpose[];
  onChange: (value: Config) => void;
}) {
  const eligible = config.providers.filter((p) => p.enabled && p.model);
  const preferred =
    eligible.find((p) => p.id === config.defaults.textProfileId) ?? eligible[0];
  const llm = config.languageDetection.mode === "llm";
  const bind = (purpose: string, id: string | null) =>
    onChange(assignProvider(config, purpose, id));
  return (
    <>
      <section
        className="provider-config-section"
        id="feature-providers"
        aria-label={t("功能提供商配置")}
      >
        <h2>{t("功能提供商")}</h2>
        {purposes
          .filter((p) => p.id !== "languageDetection")
          .map((purpose) => {
            const isAction = purpose.id.startsWith("action:");
            const action = isAction
              ? config.actions.find((a) => a.id === purpose.id.slice(7))
              : null;
            const isOcr = purpose.id === "ocr";
            const name =
              action?.id === "translate" && action.name === "翻译"
                ? t("划词翻译")
                : purpose.name;
            const suggestion = purpose.id === "noteSuggestion";
            const description =
              purpose.id === "tts"
                ? t("为在线音色合成朗读音频。")
                : suggestion
                  ? t("从翻译原文中推荐值得收藏的词或短语。")
                  : action
                    ? descriptions[action.id]
                      ? t(descriptions[action.id])
                      : action.system
                    : isOcr
                      ? t("识别图片或扫描文档中的文字。")
                      : t("未单独指定提供商的指令用这个模型。");
            return (
              <div className="provider-config-row" key={purpose.id}>
                <div>
                  <h3>{name}</h3>
                  <p title={description}>{description}</p>
                </div>
                <ProviderSelect
                  label={name + t("的提供商")}
                  config={config}
                  value={purpose.providerId}
                  vision={isOcr}
                  emptyLabel={
                    purpose.id === "tts"
                      ? t("不使用在线服务")
                      : isAction || suggestion
                        ? t("跟随默认提供商")
                        : isOcr
                          ? t("内置离线 OCR")
                          : undefined
                  }
                  onChange={(id) => bind(purpose.id, id)}
                />
              </div>
            );
          })}
      </section>
      <section
        className="provider-config-section"
        id="language-detection"
        aria-label={t("语言检测")}
      >
        <h2>{t("语言检测")}</h2>
        <div className="provider-config-row detection-row">
          <div>
            <h3>{t("检测提供商")}</h3>
            <p>{t("翻译时识别源语言，朗读时匹配系统语音。")}</p>
            <small className="detection-status">
              <i />
              {llm ? t("LLM 检测已启用") : t("基础检测 · 本机运行")}
            </small>
          </div>
          <div className="detection-controls">
            <div
              className="detection-modes"
              role="radiogroup"
              aria-label={t("语言检测模式")}
            >
              <label>
                <input
                  type="radio"
                  name="detection-mode"
                  checked={!llm}
                  onChange={() => bind("languageDetection", null)}
                />
                {t("基础")}
              </label>
              <label
                title={preferred ? undefined : t("添加模型后可启用 LLM 检测")}
              >
                <input
                  type="radio"
                  name="detection-mode"
                  checked={llm}
                  disabled={!preferred}
                  onChange={() =>
                    preferred && bind("languageDetection", preferred.id)
                  }
                />
                LLM
              </label>
            </div>
            {config.languageDetection.mode === "llm" && (
              <ProviderSelect
                label={t("语言检测的提供商")}
                config={config}
                value={config.languageDetection.providerId}
                onChange={(ref) => bind("languageDetection", ref)}
              />
            )}
          </div>
        </div>
        <p className="detection-hint">
          {llm
            ? t(
                "自动检测时向所选模型发送最多 500 个字符。检测失败时使用本地基础检测。",
              )
            : t("基础检测离线运行。选择 LLM 可使用指定模型检测语言。")}
        </p>
      </section>
    </>
  );
}
