import { t, setLocale } from "../shared/i18n";
import { useSpeechEvents } from "./speech";
import { SelectionToolbar } from "./SelectionToolbar";

import { useEffect, useState, useRef } from "react";
import {
  SlidersHorizontal,
  Server,
  AudioLines,
  ScanLine,
  WandSparkles,
  FolderSync,
  Minus,
  X,
  Circle,
  Keyboard,
  LibraryBig,
  Info,
  RefreshCw,
} from "lucide-react";
import type { SettingsLocation, Snapshot } from "../shared/api";
import { Settings } from "./Settings";
import { CaptureOverlay } from "./Capture";
import { InteractionPanel } from "./InteractionPanel";
import { BrandMark } from "./ui";
import { useDesktop } from "./useDesktop";

const navigation = [
  ["general", "通用", SlidersHorizontal],
  ["text", "API 提供商", Server],
  ["tts", "文本转语音", AudioLines],
  ["ocr", "截图识别", ScanLine],
  ["actions", "自定义 AI 指令", WandSparkles],
  ["shortcuts", "快捷键", Keyboard],
  ["config", "配置管理", FolderSync],
] as const;

function SettingsApp({
  snapshot,
  onSnapshot,
}: {
  snapshot: Snapshot;
  onSnapshot: (value: Snapshot) => void;
}) {
  const [location, setLocation] = useState<SettingsLocation>({
    tab: "general",
    request: 0,
  });
  const tab = location.tab;
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    content.current?.scrollTo({ top: 0 });
  }, [tab]);
  useEffect(() => {
    let current = true;
    void window.readfinch.call("settingsLocation").then((v) => {
      if (current) setLocation(v);
    });
    const off = window.readfinch.on("settings", (v) => {
      current = false;
      setLocation(v);
    });
    return () => {
      current = false;
      off();
    };
  }, []);
  return (
    <div className="settings-shell">
      <header className="window-titlebar">
        <BrandMark />
        <span>
          {t("伴读雀")} <span className="muted">{t("设置")}</span>
        </span>
        <div className="grow" />
        <button
          className="window-control"
          aria-label={t("最小化")}
          onClick={() =>
            void window.readfinch.call("window", { command: "minimize" })
          }
        >
          <Minus size={16} />
        </button>
        <button
          className="window-control close-control"
          aria-label={t("关闭设置")}
          title={t("关闭后继续在托盘运行")}
          onClick={() =>
            void window.readfinch.call("window", { command: "close" })
          }
        >
          <X size={17} />
        </button>
      </header>
      <aside className="settings-sidebar">
        <div className="sidebar-scroll">
          <div className="sidebar-label">{t("偏好设置")}</div>
          <nav aria-label={t("设置分类")}>
            {navigation.map(([id, label, Icon]) => (
              <button
                key={id}
                aria-label={t(label)}
                title={t(label)}
                aria-current={tab === id ? "page" : undefined}
                className={tab === id ? "selected" : ""}
                onClick={() => setLocation({ tab: id, request: 0 })}
              >
                <Icon size={17} />
                <span>{t(label)}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-label library-label">{t("资料库")}</div>
          <nav aria-label={t("资料库")}>
            <button
              aria-label={t("本地笔记库")}
              title={t("本地笔记库")}
              aria-current={tab === "notes" ? "page" : undefined}
              className={tab === "notes" ? "selected" : ""}
              onClick={() => setLocation({ tab: "notes", request: 0 })}
            >
              <LibraryBig size={17} />
              <span>{t("本地笔记库")}</span>
            </button>
          </nav>
        </div>
        <nav className="sidebar-system" aria-label={t("应用信息")}>
          {(
            [
              ["updates", "软件更新", RefreshCw],
              ["about", "关于", Info],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              aria-label={t(label)}
              title={t(label)}
              aria-current={tab === id ? "page" : undefined}
              className={tab === id ? "selected" : ""}
              onClick={() => setLocation({ tab: id, request: 0 })}
            >
              <Icon size={17} />
              <span>{t(label)}</span>
              {id === "updates" &&
                ["available", "downloaded"].includes(
                  snapshot.updates.status,
                ) && <span className="sidebar-update-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="native-state" title={t(snapshot.nativeStatus)}>
            <Circle
              size={7}
              fill="currentColor"
              className={
                snapshot.config.selection.automatic &&
                snapshot.toolbarPausedUntil <= Date.now() &&
                snapshot.nativeState === "ready"
                  ? "available"
                  : "muted"
              }
            />
            <span>
              {!snapshot.config.selection.automatic ||
              snapshot.toolbarPausedUntil > Date.now()
                ? t("自动划词已暂停")
                : snapshot.nativeState === "ready"
                  ? t("划词服务运行中")
                  : t("划词服务需检查")}
            </span>
          </div>
          <span className="app-version">
            {t("伴读雀")} {snapshot.version}
          </span>
        </div>
      </aside>
      <main className="settings-content" ref={content}>
        <Settings
          snapshot={snapshot}
          onSnapshot={onSnapshot}
          initialTab={tab}
          navigation={location}
        />
      </main>
    </div>
  );
}

export function App() {
  useSpeechEvents();
  const mode = new URLSearchParams(location.search).get("mode") ?? "main";
  const { snapshot, setSnapshot, error } = useDesktop();
  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);
  if (snapshot) {
    setLocale(snapshot.interfaceLocale);
    document.documentElement.lang = snapshot.interfaceLocale;
  }
  useEffect(() => {
    document.title = t("伴读雀");
  }, [snapshot?.interfaceLocale]);
  if (!snapshot)
    return (
      <div className="boot-message" role="status">
        {error || t("正在载入…")}
      </div>
    );
  if (mode === "pill") return <SelectionToolbar config={snapshot.config} />;
  if (mode === "capture") return <CaptureOverlay />;
  if (mode === "panel") return <InteractionPanel snapshot={snapshot} />;
  return <SettingsApp snapshot={snapshot} onSnapshot={setSnapshot} />;
}
