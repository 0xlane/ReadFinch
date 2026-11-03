import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Action } from "../shared/config";
import { actionLabel, t } from "../shared/i18n";
import { formatShortcut } from "../shared/shortcuts";
import { ActionIcon } from "./ui";
import "./command-chooser.css";

const descriptions: Record<string, string> = {
  translate: "转换为目标语言",
  dictionary: "释义、例句与记忆技巧",
  sentence: "拆解句子结构与语法",
  polish: "改善语法与表达",
};

export function CommandChooser({
  actions,
  disabled,
  onRun,
}: {
  actions: Action[];
  disabled: boolean;
  onRun: (action: Action) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ordered = [
    ...actions.filter((action) => action.pinned),
    ...actions.filter((action) => !action.pinned),
  ];
  const primary = ordered.slice(0, 4);
  const additional = ordered.slice(4);
  function entry(action: Action) {
    const shortcut = action.shortcut && formatShortcut(action.shortcut);
    const label = actionLabel(action);
    const description = t(descriptions[action.id] ?? "处理选中的文字");
    return (
      <button
        className="command-choice"
        key={action.id}
        data-command={action.id}
        aria-label={label}
        title={[label, description, shortcut].filter(Boolean).join(" · ")}
        disabled={disabled}
        onClick={() => onRun(action)}
      >
        <span className="command-choice-icon" aria-hidden="true">
          <ActionIcon icon={action.icon} size={22} />
        </span>
        <span className="command-choice-copy">
          <span className="command-choice-name">{label}</span>
          <span className="command-choice-detail" data-shortcut={!!shortcut}>
            <span className="command-choice-description">{description}</span>
            {shortcut && <kbd>{shortcut}</kbd>}
          </span>
        </span>
        <ChevronRight
          className="command-choice-arrow"
          size={14}
          aria-hidden="true"
        />
      </button>
    );
  }
  return (
    <section className="command-chooser" aria-label={t("选择指令")}>
      <div className="command-choice-grid">{primary.map(entry)}</div>
      {additional.length > 0 && (
        <>
          <button
            className="command-choice-more"
            aria-label={t("更多指令")}
            aria-expanded={expanded}
            aria-controls="additional-commands"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? t("收起指令") : t("更多指令")}
            <span>{additional.length}</span>
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          {expanded && (
            <div
              id="additional-commands"
              className="command-choice-grid command-choice-additional"
            >
              {additional.map(entry)}
            </div>
          )}
        </>
      )}
    </section>
  );
}
