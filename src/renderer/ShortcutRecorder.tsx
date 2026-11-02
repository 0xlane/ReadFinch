import { t } from "../shared/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { Keyboard, X } from "lucide-react";
import { formatShortcut, shortcutFromEvent } from "../shared/shortcuts";

export function ShortcutRecorder({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const owner = useRef("");
  const ready = useRef(false);
  const committed = useRef(false);
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState("");
  function release() {
    const id = owner.current;
    owner.current = "";
    ready.current = false;
    committed.current = false;
    setRecording(false);
    setHint("");
    if (id)
      void window.texthop
        .call("shortcutRecording", { id, active: false })
        .catch(() => {});
  }
  async function begin() {
    const id = crypto.randomUUID();
    owner.current = id;
    ready.current = false;
    committed.current = false;
    setRecording(true);
    setHint(t("正在准备…"));
    try {
      await window.texthop.call("shortcutRecording", { id, active: true });
      if (owner.current === id) {
        ready.current = true;
        setHint(t("按组合键 · Esc 取消 · Backspace 清空"));
      }
    } catch (error) {
      if (owner.current === id) {
        release();
        setHint((error as Error).message);
      }
    }
  }
  useEffect(() => {
    const blur = () => {
      input.current?.blur();
      release();
    };
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("blur", blur);
      release();
    };
  }, []);
  return (
    <div className={"shortcut-control" + (recording ? " recording" : "")}>
      <div className="shortcut-input">
        <Keyboard size={15} aria-hidden="true" />
        <input
          ref={input}
          readOnly
          aria-label={label}
          aria-describedby={hint ? hintId : undefined}
          value={
            recording && !committed.current
              ? ""
              : value
                ? formatShortcut(value)
                : ""
          }
          placeholder={recording ? t("请按组合键…") : t("点击设置快捷键")}
          onFocus={() => void begin()}
          onBlur={release}
          onKeyDown={(event) => {
            if (
              event.key === "Tab" &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.metaKey
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            if (!ready.current || event.repeat || committed.current) return;
            if (event.key === "Escape") {
              input.current?.blur();
              return;
            }
            const clear =
              ["Backspace", "Delete"].includes(event.key) &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.metaKey &&
              !event.shiftKey;
            const key = clear ? "" : shortcutFromEvent(event.nativeEvent);
            if (key !== null) {
              committed.current = true;
              onChange(key);
              setHint(t("松开按键后自动保存"));
            } else if (!["Control", "Alt", "Shift", "Meta"].includes(event.key))
              setHint(t("请按 Ctrl、Alt、⌘ 或 Win 加一个普通按键"));
          }}
          onKeyUp={(event) => {
            if (committed.current) {
              event.preventDefault();
              event.stopPropagation();
              input.current?.blur();
            }
          }}
        />
        {value && !recording && (
          <button
            className="icon-button"
            aria-label={t("清空") + label}
            title={t("清空快捷键")}
            onClick={() => onChange("")}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {hint && (
        <span className="shortcut-hint" id={hintId} role="status">
          {hint}
        </span>
      )}
    </div>
  );
}
