import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import type { Action, Config } from "../shared/config";
import { buildActionHelperPrompt } from "../shared/action-ai-helper";
import { resolveLocale, t } from "../shared/i18n";
import { resolveResultLanguage } from "../shared/languages";

export function ActionAIHelper({
  action,
  config,
}: {
  action: Action;
  config: Config;
}) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    popover = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false),
    [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  const place = () => {
    const rect = trigger.current!.getBoundingClientRect(),
      panel = popover.current!;
    panel.style.left =
      Math.max(
        12,
        Math.min(
          innerWidth - panel.offsetWidth - 12,
          rect.right - panel.offsetWidth,
        ),
      ) + "px";
    panel.style.top =
      (rect.bottom + panel.offsetHeight + 10 > innerHeight
        ? Math.max(12, rect.top - panel.offsetHeight - 8)
        : rect.bottom + 8) + "px";
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    document.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);
  async function copy() {
    setError("");
    try {
      // Build on click, so unsaved edits are included. No credentials enter this input.
      const state = await window.readfinch.call("snapshot");
      const text = buildActionHelperPrompt({
        action,
        otherActionNames: config.actions
          .filter((a) => a.id !== action.id)
          .map((a) => a.name),
        uiLocale: resolveLocale(
          config.appearance.language,
          state.systemLanguages,
        ),
        targetLanguage: resolveResultLanguage(
          config.defaults.targetLanguage,
          config.appearance.language,
          state.systemLanguages,
        ),
        explanationLanguage: resolveResultLanguage(
          config.defaults.explanationLanguage,
          config.appearance.language,
          state.systemLanguages,
        ),
      });
      await window.readfinch.call("clipboardWrite", { text });
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t("复制失败，请重试"));
    }
  }
  return (
    <>
      <button
        ref={trigger}
        className="secondary compact assist"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          const panel = popover.current!;
          if (panel.matches(":popover-open")) panel.hidePopover();
          else {
            setError("");
            setCopied(false);
            panel.showPopover();
            place();
          }
        }}
      >
        <Sparkles size={14} />
        {t("让 AI 帮我配置")}
      </button>
      <div
        id={id}
        ref={popover}
        popover="auto"
        role="dialog"
        aria-labelledby={id + "-title"}
        aria-describedby={id + "-description"}
        className="command-ai-popover"
        onToggle={(e) => {
          const visible = e.currentTarget.matches(":popover-open");
          setOpen(visible);
          if (!visible) clearTimeout(timer.current);
        }}
      >
        <h3 id={id + "-title"}>{t("让 AI 帮我配置")}</h3>
        <p id={id + "-description"}>
          {t(
            "复制下面的提示词，发给你常用的 AI 助手（ChatGPT、Claude、DeepSeek、Kimi 等）。它会先问你想做什么，再告诉你每一项怎么填。提示词里带有这条指令当前的配置，但不含 API Key。",
          )}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary compact"
          aria-label={t(copied ? "已复制" : "复制提示词")}
          onClick={() => void copy()}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span role="status">{t(copied ? "已复制" : "复制提示词")}</span>
        </button>
      </div>
    </>
  );
}
