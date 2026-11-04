import { useEffect, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { t } from "../shared/i18n";

export function ProviderKeyField({
  id,
  scope,
  saved,
  value,
  onChange,
  onRemove,
  testButton,
}: {
  id: string;
  scope: string;
  saved: boolean;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  testButton: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [stored, setStored] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setStored("");
    setError("");
    if (visible && saved && !value) {
      void window.readfinch
        .call("getCredential", { id, expectedScope: scope })
        .then((key) => {
          if (active) setStored(key);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }
    return () => {
      active = false;
    };
  }, [id, scope, visible, saved, value]);
  return (
    <div className="provider-key-field">
      <div className="provider-field-heading">
        <label htmlFor="provider-key">API Key</label>
        {testButton}
      </div>
      <div className="provider-key-input">
        <input
          id="provider-key"
          type={visible ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          aria-label={id + " API Key"}
          placeholder={saved ? "••••••••••••••••••••••••" : t("输入 API Key")}
          value={value || (visible && saved ? stored : "")}
          onChange={(e) => onChange(e.target.value)}
        />
        {saved && (
          <button
            className="icon-button"
            aria-label={t("移除凭据")}
            title={t("移除本机保存的密钥")}
            onClick={onRemove}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="provider-key-meta">
        <label>
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
          />
          {t("显示密钥")}
        </label>
        {saved && <small>{t("已保存到本机")}</small>}
      </div>
      {error && <small role="alert">{t(error)}</small>}
    </div>
  );
}
