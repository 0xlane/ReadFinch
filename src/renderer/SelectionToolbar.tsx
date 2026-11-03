import { t, actionLabel } from "../shared/i18n";
import { useEffect, useRef, useState } from "react";
import { EllipsisVertical, GripVertical, Plus, Square, X } from "lucide-react";
import {
  toolbarItems,
  type ToolbarCommand,
  type ToolbarItem,
  type ToolbarView,
  type ToolbarRect,
} from "../shared/toolbar";
import type { Config } from "../shared/config";
import { formatShortcut } from "../shared/shortcuts";
import { ActionIcon, ReferenceIcon } from "./ui";
import { speakText, stopSpeaking, useSpeechStatus } from "./speech";

const position = (r: ToolbarRect) => ({
  left: r.x,
  top: r.y,
  width: r.width,
  height: r.height,
});
const icon = (item: ToolbarItem) =>
  item.action ? (
    <ActionIcon icon={item.action.icon} size={18} />
  ) : (
    <ReferenceIcon name="tabler-volume" size={18} />
  );
type Command = ToolbarCommand extends infer T
  ? T extends ToolbarCommand
    ? Omit<T, "token">
    : never
  : never;

export function SelectionToolbar({ config }: { config: Config }) {
  const [view, setView] = useState<ToolbarView | null>(null);
  const [over, setOver] = useState("");
  const speech = useSpeechStatus();
  const reading =
    speech.key === "toolbar:" + view?.token &&
    (speech.status === "loading" || speech.status === "playing");
  const itemLabel = (item: ToolbarItem) =>
    !item.action && reading ? t("停止朗读") : item.name;
  const itemIcon = (item: ToolbarItem) =>
    !item.action && reading ? <Square size={15} /> : icon(item);
  const dragging = useRef("");
  const sticky = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<ToolbarView | null>(null);
  function clear() {
    clearTimeout(timer.current);
  }
  function send(command: Command) {
    const token = latest.current?.token;
    if (token)
      void window.readfinch
        .call("toolbar", { ...command, token })
        .catch(() => {});
  }
  useEffect(() => {
    let alive = true,
      received = false;
    function apply(state: ToolbarView | null) {
      if (
        !state ||
        state.token !== latest.current?.token ||
        state.mode === "none"
      ) {
        clear();
        sticky.current = false;
        dragging.current = "";
        setOver("");
        if (!state || state.token !== latest.current?.token) stopSpeaking();
      }
      latest.current = state;
      setView(state);
    }
    const off = window.readfinch.on("toolbarState", (v) => {
      received = true;
      apply(v);
    });
    void window.readfinch.call("toolbarState").then((v) => {
      if (alive && !received) apply(v);
    });
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        clear();
        sticky.current = false;
        send({ type: "menu", mode: "none" });
      }
    }
    window.addEventListener("keydown", key);
    return () => {
      alive = false;
      off();
      clear();
      window.removeEventListener("keydown", key);
    };
  }, []);
  if (!view) return null;
  const items = toolbarItems(config).map((i) => ({
    ...i,
    name: i.action ? actionLabel(i.action) : t(i.name),
  }));
  function leave() {
    clear();
    if (!sticky.current && latest.current?.mode === "more")
      timer.current = setTimeout(
        () => send({ type: "menu", mode: "none" }),
        220,
      );
  }
  function enterMore() {
    clear();
    if (latest.current?.mode === "none")
      timer.current = setTimeout(
        () => send({ type: "menu", mode: "more" }),
        100,
      );
  }
  function toggleMenu(mode: "more" | "disable") {
    clear();
    const closing = sticky.current && latest.current?.mode === mode;
    sticky.current = !closing;
    send({ type: "menu", mode: closing ? "none" : mode, focus: !closing });
  }
  async function run(item: ToolbarItem) {
    const token = latest.current?.token;
    if (!token) return;
    if (item.action)
      await window.readfinch.call("selectionOpen", {
        actionId: item.action.id,
        token,
      });
    else {
      const selection = await window.readfinch.call("selectionGet");
      if (selection?.token === token)
        await speakText(
          selection.text,
          config.defaults.sourceLanguage === "auto"
            ? undefined
            : config.defaults.sourceLanguage,
          { key: "toolbar:" + token },
        );
    }
  }
  return (
    <>
      <div
        className="selection-toolbar"
        role="toolbar"
        aria-label={t("划词工具栏")}
        style={position(view.bar)}
        data-open={view.mode !== "none"}
        onMouseEnter={clear}
        onMouseLeave={leave}
      >
        <div className="toolbar-pins">
          {items
            .filter((i) => i.pinned)
            .map((item) => (
              <button
                key={item.key}
                aria-label={itemLabel(item)}
                title={
                  (!item.action && speech.error
                    ? speech.error
                    : itemLabel(item)) +
                  (item.action?.shortcut
                    ? " · " + formatShortcut(item.action.shortcut)
                    : "")
                }
                onClick={() => void run(item)}
              >
                {itemIcon(item)}
              </button>
            ))}
        </div>
        <button
          className="toolbar-more"
          aria-label={t("更多指令")}
          title={t("更多指令")}
          aria-expanded={view.mode === "more"}
          onMouseEnter={enterMore}
          onMouseLeave={clear}
          onClick={() => toggleMenu("more")}
        >
          <EllipsisVertical size={16} />
        </button>
        <button
          className="toolbar-close"
          aria-label={t("关闭划词工具栏")}
          title={t("停用划词工具栏")}
          aria-expanded={view.mode === "disable"}
          onClick={() => toggleMenu("disable")}
        >
          <X size={10} />
        </button>
      </div>
      {view.popup && view.mode === "more" && (
        <div
          className="toolbar-bridge"
          onMouseEnter={clear}
          onMouseLeave={leave}
          style={{
            left: Math.max(view.bar.x, view.popup.x),
            width:
              Math.min(
                view.bar.x + view.bar.width,
                view.popup.x + view.popup.width,
              ) - Math.max(view.bar.x, view.popup.x),
            top:
              view.popup.y < view.bar.y
                ? view.popup.y + view.popup.height
                : view.bar.y + view.bar.height,
            height: 4,
          }}
        />
      )}
      {view.popup && view.mode === "more" && (
        <div
          className="toolbar-menu"
          role="group"
          aria-label={t("更多指令")}
          style={position(view.popup)}
          data-above={view.popup.y < view.bar.y}
          onMouseEnter={clear}
          onMouseLeave={leave}
        >
          <div className="toolbar-scroll">
            {items.map((item, index) => (
              <div
                className="toolbar-row"
                data-toolbar-key={item.key}
                data-over={over === item.key}
                key={item.key}
              >
                <button
                  className="toolbar-grip"
                  aria-label={t("调整顺序 ") + item.name}
                  title={t("拖动排序，也可使用上下方向键")}
                  onKeyDown={(e) => {
                    const to =
                      e.key === "ArrowUp"
                        ? index - 1
                        : e.key === "ArrowDown"
                          ? index + 1
                          : -1;
                    if (items[to]) {
                      e.preventDefault();
                      sticky.current = true;
                      send({
                        type: "move",
                        key: item.key,
                        over: items[to].key,
                      });
                    }
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    sticky.current = true;
                    dragging.current = item.key;
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (dragging.current === item.key)
                      setOver(
                        document
                          .elementFromPoint(e.clientX, e.clientY)
                          ?.closest<HTMLElement>("[data-toolbar-key]")?.dataset
                          .toolbarKey ?? "",
                      );
                  }}
                  onPointerUp={(e) => {
                    if (dragging.current !== item.key) return;
                    const key = document
                      .elementFromPoint(e.clientX, e.clientY)
                      ?.closest<HTMLElement>("[data-toolbar-key]")
                      ?.dataset.toolbarKey;
                    dragging.current = "";
                    setOver("");
                    if (key && key !== item.key)
                      send({ type: "move", key: item.key, over: key });
                  }}
                  onPointerCancel={() => {
                    dragging.current = "";
                    setOver("");
                  }}
                >
                  <GripVertical size={12} />
                </button>
                <button
                  className="toolbar-command"
                  aria-label={itemLabel(item)}
                  onClick={() => void run(item)}
                >
                  {itemIcon(item)}
                  <span>{itemLabel(item)}</span>
                </button>
                <button
                  className="toolbar-pin"
                  aria-label={t("固定 ") + item.name}
                  aria-pressed={item.pinned}
                  title={item.pinned ? t("取消固定") : t("固定到工具栏")}
                  onClick={() => {
                    sticky.current = true;
                    send({ type: "pin", key: item.key, pinned: !item.pinned });
                  }}
                >
                  <ReferenceIcon
                    name={item.pinned ? "tabler-pinned-filled" : "tabler-pin"}
                    size={15}
                  />
                </button>
              </div>
            ))}
          </div>
          <button
            className="toolbar-add"
            onClick={() => send({ type: "new-action" })}
          >
            <Plus size={15} />
            {t("添加自定义 AI 指令")}
          </button>
        </div>
      )}
      {view.popup && view.mode === "disable" && (
        <div
          className="toolbar-menu disable-menu"
          role="group"
          aria-label={t("停用划词工具栏")}
          style={position(view.popup)}
        >
          <button onClick={() => send({ type: "disable", scope: "hour" })}>
            {t("禁用 1 小时")}
          </button>
          <button
            title={view.app}
            disabled={!view.app || view.app.toLowerCase() === "unknown"}
            onClick={() => send({ type: "disable", scope: "app" })}
          >
            {t("在当前应用中禁用")}
          </button>
          <button onClick={() => send({ type: "disable", scope: "global" })}>
            {t("全局禁用")}
          </button>
          <div>
            {t("可在")}{" "}
            <button onClick={() => send({ type: "settings" })}>
              {t("设置")}
            </button>{" "}
            {t("中重新启用")}
          </div>
        </div>
      )}
    </>
  );
}
