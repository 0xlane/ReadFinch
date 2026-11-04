import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { CircleHelp, ExternalLink } from "lucide-react";
import { t } from "../shared/i18n";
import {
  parseProviderOptions,
  type ProviderOptions,
} from "../shared/provider-options";

const JsonEditor = lazy(() => import("./ProviderJsonEditor"));

export function AdvancedFieldHeading({
  id,
  label,
  help,
  docs,
}: {
  id: string;
  label: string;
  help: string;
  docs?: boolean;
}) {
  return (
    <div className="advanced-field-heading">
      <label id={id + "-label"} htmlFor={id}>
        {label}
      </label>
      <span className="advanced-field-help">
        <button
          type="button"
          aria-label={label + " · " + t("帮助")}
          aria-describedby={id + "-help"}
        >
          <CircleHelp size={14} />
        </button>
        <span id={id + "-help"} role="tooltip">
          {help}
        </span>
      </span>
      {docs && (
        <button
          type="button"
          className="provider-help-link"
          onClick={() =>
            void window.readfinch.call("openProjectLink", {
              link: "providerDocs",
            })
          }
        >
          {t("文档")} <ExternalLink size={12} />
        </button>
      )}
    </div>
  );
}

export function ProviderJsonField({
  label,
  help,
  example,
  value,
  message,
  onChange,
  onBlur,
  ready = true,
  docs,
}: {
  label: string;
  help: string;
  example: string;
  value: string;
  message: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  ready?: boolean;
  docs?: boolean;
}) {
  const id = useId();
  const loading = (
    <div className="provider-json-loading" aria-busy="true">
      {t("加载中…")}
    </div>
  );
  return (
    <div className="provider-json-field" data-invalid={!!message}>
      <AdvancedFieldHeading id={id} label={label} help={help} docs={docs} />
      {ready ? (
        <Suspense fallback={loading}>
          <JsonEditor {...{ id, value, example, onChange, onBlur }} />
        </Suspense>
      ) : (
        loading
      )}
      {message && <small role="alert">{message}</small>}
    </div>
  );
}

export function ProviderOptionsField({
  options,
  preset,
  onChange,
}: {
  options?: ProviderOptions;
  preset: string;
  onChange: (options?: ProviderOptions) => void;
}) {
  const stored = JSON.stringify(options, null, 2) ?? "";
  const committed = useRef(stored);
  const [draft, setDraft] = useState(stored);
  const [message, setMessage] = useState("");
  const example =
    preset === "gemini"
      ? { thinkingConfig: { includeThoughts: true } }
      : ["openai", "open-responses", "azure"].includes(preset)
        ? { reasoningEffort: "low" }
        : { field: "value" };
  useEffect(() => {
    if (stored !== committed.current) {
      committed.current = stored;
      setDraft(stored);
      setMessage("");
    }
  }, [stored]);
  return (
    <ProviderJsonField
      label={t("提供商选项")}
      help={t("填写此提供商支持的额外模型参数。留空使用默认选项。")}
      docs
      example={JSON.stringify(example, null, 2)}
      value={draft}
      message={message}
      onChange={(value) => {
        setDraft(value);
        try {
          const parsed = parseProviderOptions(value);
          const next = JSON.stringify(parsed, null, 2) ?? "";
          setMessage("");
          if (next !== committed.current) {
            committed.current = next;
            onChange(parsed);
          }
        } catch (error) {
          setMessage((error as Error).message);
        }
      }}
    />
  );
}
