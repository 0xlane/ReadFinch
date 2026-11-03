import { t } from "../shared/i18n";
import { useEffect, useRef, useState } from "react";
import type { TextProfile } from "../shared/config";
import { parseHeaders } from "../shared/headers";
import { Field } from "./ui";

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
  const args = { id: provider.id, endpoint: provider.endpoint };
  function flush() {
    clearTimeout(timer.current);
    const text = pending.current;
    if (text === undefined) return;
    pending.current = undefined;
    void window.readfinch
      .call("providerHeaders", { ...args, value: text })
      .then(() => setMessage(""))
      .catch((e) => setMessage(e.message));
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
    <div>
      <Field
        label={t("自定义请求头")}
        hint={t("填写 JSON 对象。请求头加密保存在本机。")}
      >
        <textarea
          rows={3}
          spellCheck={false}
          disabled={!ready}
          placeholder={'{ "X-Project": "readfinch" }'}
          value={value}
          onBlur={flush}
          onChange={(e) => {
            onChange?.();
            const text = e.target.value;
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
      </Field>
      {message && <small role="alert">{t(message)}</small>}
    </div>
  );
}
