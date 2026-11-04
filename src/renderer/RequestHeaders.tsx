import { t } from "../shared/i18n";
import { useEffect, useRef, useState } from "react";
import type { TextProfile } from "../shared/config";
import { parseHeaders } from "../shared/headers";
import { ProviderJsonField } from "./ProviderAdvancedField";

export function RequestHeaders({
  provider,
  onChange,
}: {
  provider: TextProfile;
  onChange?: () => void;
}) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<string | undefined>(undefined);
  const revision = useRef(0);
  const args = { id: provider.id, endpoint: provider.endpoint };
  function flush() {
    clearTimeout(timer.current);
    const text = pending.current;
    if (text === undefined) return;
    pending.current = undefined;
    const editing = revision.current;
    void window.readfinch
      .call("providerHeaders", { ...args, value: text })
      .catch((e) => {
        if (editing === revision.current) setMessage(e.message);
      });
  }
  useEffect(() => {
    let alive = true;
    window.readfinch
      .call("providerHeaders", args)
      .then((v) => {
        if (alive) {
          setValue(v);
          setReady(true);
        }
      })
      .catch((e) => {
        if (alive) setMessage(e.message);
      });
    return () => {
      alive = false;
      flush();
    };
  }, [provider.id, provider.endpoint]);
  return (
    <ProviderJsonField
      label={t("自定义请求头")}
      help={t("填写 JSON 对象。请求头以明文保存在本机。")}
      ready={ready}
      example={'{\n  "X-Project": "readfinch"\n}'}
      value={value}
      message={t(message)}
      onBlur={flush}
      onChange={(text) => {
        revision.current++;
        onChange?.();
        setValue(text);
        clearTimeout(timer.current);
        pending.current = undefined;
        try {
          parseHeaders(text);
          setMessage("");
          pending.current = text;
          timer.current = setTimeout(flush, 450);
        } catch (error) {
          setMessage((error as Error).message);
        }
      }}
    />
  );
}
