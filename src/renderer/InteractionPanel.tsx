import { t, actionLabel } from "../shared/i18n";
import { stopSpeaking, useSpeechStatus } from "./speech";
import { useEffect, useRef, useState } from "react";
import {
  Pin,
  PinOff,
  Bookmark,
  X,
  Settings2,
  Copy,
  Check,
  RotateCcw,
  Square,
  ChevronDown,
  Clipboard,
  ScanLine,
  ImagePlus,
  LoaderCircle,
  ArrowUpRight,
  Pencil,
  AlignLeft,
  ChevronUp,
  PanelTop,
  GripHorizontal,
} from "lucide-react";
import type { Interaction, Snapshot, Capture } from "../shared/api";
import type { Action } from "../shared/config";
import { ProviderSelect } from "./ProviderSelect";
import { CommandChooser } from "./CommandChooser";
import { actionModel, type ModelRef } from "../shared/models";
import { cleanupLines, ocrProfiles } from "../shared/config";
import { ActionIcon, BrandMark, LanguageSelect, ReferenceIcon } from "./ui";
import {
  notebookKey,
  noteSourceApp,
  type NoteInput,
  type SuggestionCardData,
} from "../shared/notes";
import { NoteSuggestionCard } from "./NoteSuggestionCard";
import { Result, Speak, copyableResult } from "./Result";
import { snapshotOutput, streamingValues } from "../shared/action-output";
import { connectedBook } from "../shared/notebases";

function WaitingForModel({ model }: { model?: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(
      () => setSeconds(Math.floor((performance.now() - start) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="result-pending">
      <LoaderCircle size={16} className="spin" aria-hidden="true" />
      <div>
        <span role="status">{t("等待模型响应")}</span>
        <small>
          {[model, seconds >= 2 && t("已等待 {0} 秒", String(seconds))]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </div>
    </div>
  );
}

export function InteractionPanel({ snapshot }: { snapshot: Snapshot }) {
  const [session, setSession] = useState<Interaction | null>(null);
  const [text, setText] = useState("");
  const [context, setContext] = useState("");
  const [image, setImage] = useState<Capture | null>(null);
  const [target, setTarget] = useState(snapshot.config.defaults.targetLanguage);
  const [sourceLanguage, setSourceLanguage] = useState(
    snapshot.config.defaults.sourceLanguage,
  );
  const [ocrProfile, setOcrProfile] = useState(
    snapshot.config.defaults.ocrProfileId,
  );
  const [activeAction, setActiveAction] = useState<Action | null>(null);
  const [result, setResult] = useState("");
  const [resultSource, setResultSource] = useState("");
  const [phase, setPhase] = useState<
    "idle" | "running" | "done" | "cancelled" | "error"
  >("idle");
  const [kind, setKind] = useState<"text" | "ocr">("text");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [confidence, setConfidence] = useState<number>();
  const [pinned, setPinned] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sourceOverflows, setSourceOverflows] = useState(false);
  const sourceText = useRef<HTMLParagraphElement>(null);
  const [savedNote, setSavedNote] = useState("");
  const narration = useSpeechStatus();
  const [confirmBook, setConfirmBook] = useState(false),
    [savingNote, setSavingNote] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionCardData | null>(
    null,
  );
  const resultRun = useRef("");
  const [noteError, setNoteError] = useState("");
  const noteDraft = useRef<Omit<NoteInput, "result"> | null>(null);
  const [showImage, setShowImage] = useState(true);
  const [providerId, setProviderId] = useState(
    snapshot.config.defaults.textProfileId,
  );
  const modelChoice = useRef<
    { actionId: string | null; ref: ModelRef } | undefined
  >(undefined);
  const autoRan = useRef("");
  const autoRecognized = useRef("");
  const currentJob = useRef("");
  const shortcutAction = useRef<(id: string) => void>(() => {});
  const sessionId = useRef("");
  const content = useRef<HTMLDivElement>(null);
  const defaults = useRef(snapshot.config.defaults);
  defaults.current = snapshot.config.defaults;
  const running = phase === "running";
  const cfg = snapshot.config;
  const enabled = cfg.actions.filter((action) => action.enabled);
  const provider = cfg.providers.find(
    (item) => item.enabled && item.id === providerId,
  );
  const availableOcr = ocrProfiles(cfg);
  const selectedOcr = availableOcr.find((item) => item.id === ocrProfile);
  const configured =
    !!provider &&
    !!provider.model &&
    (!provider.requiresKey ||
      snapshot.credentialIds.includes("text:" + provider.id));

  function stop() {
    const id = currentJob.current || resultRun.current;
    if (id) void window.readfinch.call("cancel", { id });
    currentJob.current = "";
    resultRun.current = "";
    setSuggestions(null);
    setPhase((value) => (value === "running" ? "cancelled" : value));
  }
  useEffect(() => {
    function receive(value: Interaction | null) {
      if (!value || sessionId.current === value.id) return;
      stop();
      sessionId.current = value.id;
      setSession(value);
      setText(value.text);
      setImage(value.capture ?? null);
      setContext("");
      setResult("");
      setResultSource("");
      setPhase("idle");
      setKind(value.capture ? "ocr" : "text");
      setError(value.error ?? "");
      setConfidence(undefined);
      setEditing(!value.text && value.source !== "selection-unavailable");
      setShowImage(true);
      setPinned(!!value.pinned);
      setCopied(false);
      setExpanded(false);
      noteDraft.current = null;
      setSavedNote("");
      setConfirmBook(false);
      setSavingNote(false);
      setNoteError("");
      setTarget(defaults.current.targetLanguage);
      setSourceLanguage(defaults.current.sourceLanguage);
      setOcrProfile(defaults.current.ocrProfileId);
      setActiveAction(null);
      setProviderId(defaults.current.textProfileId);
      modelChoice.current = undefined;
      stopSpeaking();
    }
    const offs = [
      window.readfinch.on("interaction", receive),
      window.readfinch.on("noteSuggestions", (value) => {
        if (value.id === resultRun.current)
          setSuggestions(value.items.length ? value : null);
      }),
      window.readfinch.on("actionShortcut", ({ actionId }) =>
        shortcutAction.current(actionId),
      ),
      window.readfinch.on("hidden", () => {
        stop();
        stopSpeaking();
      }),
      window.readfinch.on("job", (event) => {
        if (event.id !== currentJob.current) return;
        if (event.text !== undefined) {
          if (event.kind === "ocr") {
            setText(event.text);
            setEditing(true);
          } else setResult(event.text);
        }
        if (event.progress !== undefined) setProgress(event.progress);
        if (event.confidence !== undefined) setConfidence(event.confidence);
        if (
          event.status === "done" ||
          event.status === "error" ||
          event.status === "cancelled"
        ) {
          setPhase(event.status);
          setError(
            event.status === "error" ? (event.message ?? t("请求失败")) : "",
          );
          currentJob.current = "";
        }
      }),
      window.readfinch.on("selectionInvalid", () =>
        setSession((value) =>
          value?.selection
            ? { ...value, selection: { ...value.selection, canReplace: false } }
            : value,
        ),
      ),
    ];
    void window.readfinch.call("interactionGet").then(receive);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape")
        void window.readfinch.call("window", { command: "dismiss" });
    };
    addEventListener("keydown", key);
    return () => {
      offs.forEach((off) => off());
      removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    if (
      !session?.actionId ||
      session.source !== "selection" ||
      autoRan.current === session.id
    )
      return;
    const action = cfg.actions.find(
      (item) => item.id === session.actionId && item.enabled,
    );
    if (action) {
      autoRan.current = session.id;
      void run(action);
    }
  }, [session?.id]);
  useEffect(() => {
    if (
      !session?.capture ||
      !["capture", "image"].includes(session.source) ||
      autoRecognized.current === session.id
    )
      return;
    // One recognition per explicit image acquisition. Changing a setting or
    // returning to this card must not restart a cancelled job or upload an image.
    autoRecognized.current = session.id;
    if (selectedOcr && selectedOcr.kind !== "openai") void recognize();
  }, [session?.id]);
  useEffect(() => {
    const element = sourceText.current;
    if (!element) {
      setSourceOverflows(false);
      return;
    }
    const measure = () =>
      setSourceOverflows(
        element.scrollHeight >
          Math.ceil(parseFloat(getComputedStyle(element).lineHeight) * 2),
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, editing, session?.id]);
  useEffect(() => {
    if (!content.current) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = Math.max(
          180,
          Math.ceil(content.current!.getBoundingClientRect().height + 92),
        );
        void window.readfinch.call("panelResize", {
          height: Math.min(3000, height),
        });
      });
    });
    observer.observe(content.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    if (ocrProfiles(cfg).every((item) => item.id !== ocrProfile))
      setOcrProfile(cfg.defaults.ocrProfileId);
  }, [cfg.providers, cfg.defaults.ocrProfileId, ocrProfile]);

  async function run(
    action: Action,
    override?: string | ModelRef,
    targetOverride?: string,
    refresh = false,
  ) {
    if (running && kind === "ocr") return;
    if (!text.trim()) {
      setEditing(true);
      return;
    }
    stop();
    setActiveAction(action);
    setResult("");
    setResultSource(text);
    setSavedNote("");
    setConfirmBook(false);
    setSavingNote(false);
    setNoteError("");
    noteDraft.current = null;
    setError("");
    setKind("text");
    setEditing(false);
    setShowImage(false);
    setCopied(false);
    action = cfg.actions.find((item) => item.id === action.id) ?? action;
    const requested =
      typeof override === "string"
        ? { providerId: override }
        : override?.model
          ? override
          : undefined;
    const remembered =
      modelChoice.current &&
      (modelChoice.current.actionId === action.id ||
        modelChoice.current.actionId === null)
        ? modelChoice.current.ref
        : undefined;
    const binding = actionModel(cfg, action, requested ?? remembered);
    modelChoice.current =
      requested || remembered
        ? { actionId: action.id, ref: binding }
        : undefined;
    const selectedId = binding.providerId;
    const selected = cfg.providers.find((item) => item.id === selectedId);
    setProviderId(selectedId);
    if (
      !binding.model ||
      (selected?.requiresKey &&
        !snapshot.credentialIds.includes("text:" + selected.id))
    ) {
      setPhase("error");
      setError(t("先配置此指令使用的文字模型，即可开始处理。"));
      return;
    }
    noteDraft.current = {
      notebook: notebookKey(action),
      actionId: action.id,
      actionName: actionLabel(action),
      format: action.format,
      outputView: snapshotOutput(action),
      source: text,
      sourceApp: noteSourceApp(session),
      model: binding.model,
      targetLanguage: targetOverride ?? target,
    };
    const id = crypto.randomUUID();
    currentJob.current = id;
    resultRun.current = id;
    setPhase("running");
    try {
      await window.readfinch.call("runAction", {
        id,
        actionId: action.id,
        text,
        context,
        sourceLanguage,
        targetLanguage: targetOverride ?? target,
        providerId: selectedId,
        refresh,
      });
    } catch (error) {
      if (currentJob.current === id) {
        currentJob.current = "";
        setPhase("error");
        setError((error as Error).message);
      }
    }
  }
  async function recognize(refresh = false) {
    if (!image) return;
    stop();
    setKind("ocr");
    setActiveAction(null);
    setText("");
    setEditing(true);
    setResult("");
    setError("");
    setProgress(0);
    setConfidence(undefined);
    setPhase("running");
    const id = crypto.randomUUID();
    currentJob.current = id;
    try {
      await window.readfinch.call("recognize", {
        id,
        profileId: ocrProfile,
        dataUrl: image.dataUrl,
        refresh,
      });
    } catch (error) {
      if (currentJob.current === id) {
        currentJob.current = "";
        setPhase("error");
        setError((error as Error).message);
      }
    }
  }
  shortcutAction.current = (id) => {
    // An incoming interaction can update the session ref before React commits
    // its new text. Never run a key press against the preceding render's text.
    if (!session || session.id !== sessionId.current) return;
    const action = cfg.actions.find((item) => item.id === id && item.enabled);
    if (action) void run(action);
  };
  async function importImage() {
    try {
      await window.readfinch.call("imageImport");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function copy(value: string) {
    try {
      await window.readfinch.call("clipboardWrite", { text: value });
      setCopied(true);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const testAction = cfg.actions.find(
    (action) =>
      session?.source === "action-test" && action.id === session.actionId,
  );
  const noteAction = cfg.actions.find((a) => a.id === activeAction?.id);
  const destination = noteAction && connectedBook(cfg, noteAction);
  const translationWrite = useRef(Promise.resolve());
  function rememberTranslation(
    preference: { targetLanguage: string } | { providerId: string },
  ) {
    translationWrite.current = translationWrite.current
      .then(() => window.readfinch.call("setTranslationPreference", preference))
      .catch((e) => setNoteError((e as Error).message));
  }
  async function saveResult(create = false) {
    const draft = noteDraft.current;
    if (!draft || savingNote) return;
    setSavingNote(true);
    setNoteError("");
    try {
      const id = await window.readfinch.call("saveNote", {
        note: { ...draft, result },
        create,
      });
      if (noteDraft.current === draft) {
        setSavedNote(id);
        setConfirmBook(false);
      }
    } catch (e) {
      if (noteDraft.current === draft) setNoteError((e as Error).message);
    } finally {
      if (noteDraft.current === draft) setSavingNote(false);
    }
  }
  const working = !!activeAction && kind === "text";
  const waitingForContent =
    working &&
    running &&
    (!result.trim() ||
      (activeAction.outputSchema &&
        !Object.values(streamingValues(result)).some(
          (v) => typeof v === "number" || (typeof v === "string" && v.trim()),
        )));
  const choosing = !working;
  const ocrInput = !!image && !working;
  const ocrBusy = running && kind === "ocr";
  const missingSelection =
    session?.source === "selection-unavailable" && !image && !text && !editing;
  const captureShortcut = cfg.shortcuts.capture
    .replace(
      /CommandOrControl|CmdOrCtrl/g,
      snapshot.platform.startsWith("darwin") ? "⌘" : "Ctrl",
    )
    .replace(/\+/g, " + ");
  function editRecognizedText() {
    stop();
    setActiveAction(null);
    setResult("");
    setError("");
    setKind("ocr");
    setPhase(text.trim() ? "done" : "idle");
    setEditing(true);
  }
  const displayTitle = working
    ? activeAction.id === "translate"
      ? t("翻译")
      : actionLabel(activeAction)
    : image
      ? session?.source === "image"
        ? t("图片取词")
        : t("屏幕取词")
      : missingSelection
        ? t("选取文字")
        : t("选择指令");
  return (
    <div
      className={
        "interaction-shell rf-popover" + (choosing ? " command-launcher" : "")
      }
    >
      <header className="panel-titlebar rf-header">
        <GripHorizontal className="drag-grip" size={16} />
        <div className="rf-title">
          {working ? (
            <ActionIcon icon={activeAction.icon} size={18} />
          ) : image ? (
            <ScanLine size={18} />
          ) : (
            <BrandMark />
          )}
          <h2>{displayTitle}</h2>
        </div>
        <div className="grow" />
        {working && activeAction.id === "translate" && (
          <LanguageSelect
            label={t("目标语言")}
            value={target}
            onChange={(value) => {
              setTarget(value);
              rememberTranslation({ targetLanguage: value });
              void run(activeAction, undefined, value);
            }}
          />
        )}
        <button
          className={"icon-button " + (pinned ? "active" : "")}
          aria-label={pinned ? t("取消置顶") : t("保持浮窗")}
          aria-pressed={pinned}
          title={pinned ? t("取消固定") : t("固定")}
          onClick={() => {
            setPinned(!pinned);
            void window.readfinch.call("window", {
              command: "pin",
              value: !pinned,
            });
          }}
        >
          {pinned ? (
            <ReferenceIcon name="tabler-pinned-filled" />
          ) : (
            <ReferenceIcon name="tabler-pin" />
          )}
        </button>
        <button
          className="icon-button"
          aria-label={t("收起浮窗")}
          title={t("关闭 · Esc")}
          onClick={() =>
            void window.readfinch.call("window", { command: "dismiss" })
          }
        >
          <ReferenceIcon name="tabler-x" />
        </button>
      </header>
      <div className="panel-scroll">
        <div className="rf-body" ref={content}>
          {missingSelection && (
            <div className="selection-fallback">
              <h3>{t("未读到选中文字")}</h3>
              <p>
                {t(
                  "可以先选择文字。图片、扫描 PDF、视频或无法选择的界面，用框选取词。",
                )}
              </p>
              <button
                className="primary capture-entry"
                onClick={() => void window.readfinch.call("capture")}
              >
                <ScanLine size={17} />
                <span>{t("框选文字")}</span>
                {captureShortcut && <kbd>{captureShortcut}</kbd>}
              </button>
              <div className="fallback-alternatives">
                <button
                  className="text-button"
                  onClick={() =>
                    void window.readfinch.call("panelOpen", {
                      source: "clipboard",
                    })
                  }
                >
                  <Clipboard size={14} />
                  {t("读取剪贴板")}
                </button>
                <button
                  className="text-button"
                  onClick={() => void importImage()}
                >
                  <ImagePlus size={14} />
                  {t("导入图片")}
                </button>
                <button
                  className="text-button"
                  onClick={() => setEditing(true)}
                >
                  {t("输入文字")}
                </button>
              </div>
            </div>
          )}
          {!missingSelection && (
            <section className="rf-source">
              {choosing && !image && (
                <div className="command-source-heading">
                  <span>{t("原文")}</span>
                  <div>
                    <button
                      className="icon-button"
                      aria-label={t("复制原文")}
                      title={copied ? t("已复制") : t("复制原文")}
                      disabled={!text}
                      onClick={() => void copy(text)}
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={editing ? t("完成编辑") : t("编辑原文")}
                      title={editing ? t("完成编辑") : t("编辑原文")}
                      onClick={() => setEditing(!editing)}
                    >
                      {editing ? <Check size={13} /> : <Pencil size={13} />}
                    </button>
                  </div>
                </div>
              )}
              {image && (
                <div className="ocr-source-info">
                  <div className="ocr-source-heading">
                    <span>
                      <ScanLine size={13} />
                      {session?.source === "image"
                        ? t("来自图片")
                        : t("来自屏幕截图")}
                    </span>
                    <button
                      className="text-button"
                      aria-expanded={showImage}
                      onClick={() => setShowImage(!showImage)}
                    >
                      {showImage ? t("收起原图") : t("核对原图")}
                    </button>
                    {working ? (
                      <button
                        className="text-button"
                        onClick={editRecognizedText}
                      >
                        <Pencil size={13} />
                        {t("校对文字")}
                      </button>
                    ) : (
                      <button
                        className="text-button"
                        onClick={() => void window.readfinch.call("capture")}
                      >
                        <ScanLine size={13} />
                        {t("重新框选")}
                      </button>
                    )}
                  </div>
                  {showImage && (
                    <div className="capture-source">
                      <img src={image.dataUrl} alt={t("文字来源原图")} />
                    </div>
                  )}
                  {ocrInput && (
                    <>
                      <p className="microcopy">
                        {selectedOcr?.kind === "offline"
                          ? t("在此设备上识别")
                          : t(
                              "点击识别后，将原图发送到「{0}」",
                              selectedOcr?.name ?? "所选识别服务",
                            )}
                        {text.trim() && confidence !== undefined
                          ? t(" · 置信度 {0}%", Math.round(confidence))
                          : ""}
                      </p>
                      {!ocrBusy && phase === "idle" && (
                        <button
                          className="secondary ocr-start"
                          onClick={() => void recognize()}
                        >
                          <ScanLine size={14} />
                          {t("识别文字")}
                        </button>
                      )}
                      {phase === "done" && !text.trim() && (
                        <div className="ocr-empty" role="status">
                          {t(
                            "没有识别到文字。试试缩小范围，或放大原画面后重新框选。",
                          )}
                        </div>
                      )}
                      {text.trim() && !ocrBusy && (
                        <p className="ocr-review-label">
                          {t("识别文字 · 可直接校对，再选择下方指令")}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
              {editing || !text ? (
                <textarea
                  className="source-editor"
                  aria-label={t("原文")}
                  placeholder={
                    image
                      ? t("识别后的文字可在这里编辑…")
                      : t("粘贴或输入要处理的文字…")
                  }
                  rows={ocrInput ? 5 : 3}
                  readOnly={ocrBusy}
                  maxLength={100000}
                  value={text}
                  onChange={(event) => {
                    stop();
                    setText(event.target.value);
                    setCopied(false);
                  }}
                  onBlur={() => {
                    if (text && working) setEditing(false);
                  }}
                />
              ) : (
                <div
                  className={"rf-source-row " + (expanded ? "expanded" : "")}
                >
                  <p className="rf-source-text" ref={sourceText}>
                    {text}
                  </p>
                  {(!choosing || sourceOverflows || expanded) && (
                    <button
                      className="icon-button"
                      aria-label={expanded ? t("收起原文") : t("展开原文")}
                      onClick={() => setExpanded(!expanded)}
                    >
                      {expanded ? (
                        <ReferenceIcon name="tabler-chevron-up" />
                      ) : (
                        <ReferenceIcon name="tabler-chevron-down" />
                      )}
                    </button>
                  )}
                </div>
              )}
              {expanded && (!choosing || !!image) && (
                <div className="rf-inline-tools">
                  <button
                    className="icon-button"
                    aria-label={t("复制原文")}
                    onClick={() => void copy(text)}
                  >
                    <ReferenceIcon name="tabler-copy" />
                  </button>
                  <Speak
                    text={text}
                    language={
                      sourceLanguage === "auto" ? undefined : sourceLanguage
                    }
                  />
                  <button
                    className="icon-button"
                    aria-label={t("编辑原文")}
                    onClick={() => setEditing(true)}
                  >
                    <Pencil size={15} />
                  </button>
                </div>
              )}
              {expanded && !ocrInput && (
                <div className="source-supplement">
                  <label>
                    {t("补充说明（可选）")}
                    <textarea
                      rows={2}
                      maxLength={100000}
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      placeholder={t(
                        "例如术语含义或写作对象，下次生成时使用。",
                      )}
                    />
                  </label>
                  <LanguageSelect
                    label={t("原文语言")}
                    auto
                    value={sourceLanguage}
                    onChange={setSourceLanguage}
                  />
                </div>
              )}
              {ocrInput && text && !ocrBusy && (
                <div className="ocr-text-tools">
                  <button
                    className="text-button"
                    onClick={() => setText(cleanupLines(text))}
                  >
                    <AlignLeft size={13} />
                    {t("合并断行")}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => void copy(text)}
                  >
                    <Copy size={13} />
                    {copied ? t("已复制") : t("复制原文")}
                  </button>
                </div>
              )}
            </section>
          )}
          {!working && !missingSelection && (
            <>
              <CommandChooser
                key={session?.id}
                actions={enabled}
                disabled={!text.trim() || ocrBusy}
                onRun={(action) => void run(action)}
              />
              {testAction && (
                <button
                  className="test-action secondary"
                  disabled={!text.trim() || ocrBusy}
                  onClick={() => void run(testAction)}
                >
                  {t("测试「")}
                  {actionLabel(testAction)}」
                </button>
              )}
              {!image && !text && (
                <div className="empty-context-tools">
                  <button
                    className="secondary"
                    onClick={() =>
                      void window.readfinch.call("panelOpen", {
                        source: "clipboard",
                      })
                    }
                  >
                    <Clipboard size={15} />
                    {t("读取剪贴板")}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => void window.readfinch.call("capture")}
                  >
                    <ScanLine size={15} />
                    {t("框选文字")}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t("导入图片")}
                    onClick={() => void importImage()}
                  >
                    <ImagePlus size={16} />
                  </button>
                </div>
              )}
            </>
          )}
          {running && kind === "ocr" && (
            <div className="job-progress" role="status">
              <LoaderCircle size={16} className="spin" />
              {t("正在识别文字")}
              {progress > 0 ? ` · ${Math.round(progress * 100)}%` : ""}
              <button className="text-button" onClick={stop}>
                {t("取消")}
              </button>
            </div>
          )}
          {working && (
            <section className="rf-result" aria-label={t("处理结果")}>
              {waitingForContent ? (
                <WaitingForModel
                  key={currentJob.current}
                  model={noteDraft.current?.model}
                />
              ) : result ? (
                activeAction.id === "translate" ? (
                  <p className="rf-translation">
                    {result}
                    {running && <span className="stream-caret" />}
                  </p>
                ) : (
                  <Result
                    text={result}
                    format={activeAction.format}
                    view={snapshotOutput(activeAction)}
                    targetLanguage={noteDraft.current?.targetLanguage}
                    status={
                      running
                        ? "streaming"
                        : phase === "done"
                          ? "done"
                          : "error"
                    }
                    autoplay
                    source={resultSource}
                    finished={!running}
                  />
                )
              ) : null}
              {result && !waitingForContent && (
                <div className="rf-inline-tools">
                  <button
                    className="icon-button"
                    aria-label={t("复制结果")}
                    title={copied ? t("已复制") : t("复制")}
                    onClick={() =>
                      void copy(
                        copyableResult(
                          result,
                          activeAction.format,
                          snapshotOutput(activeAction),
                          resultSource,
                        ),
                      )
                    }
                  >
                    {copied ? (
                      <Check size={16} />
                    ) : (
                      <ReferenceIcon name="tabler-copy" />
                    )}
                  </button>
                  <Speak
                    language={
                      activeAction.id === "translate" ? target : undefined
                    }
                    text={copyableResult(
                      result,
                      activeAction.format,
                      snapshotOutput(activeAction),
                      resultSource,
                    )}
                  />
                  {phase === "done" && noteDraft.current && (
                    <button
                      className={
                        "icon-button note-bookmark" +
                        (savedNote ? " saved" : "")
                      }
                      aria-label={
                        savedNote ? t("在笔记库中查看") : t("保存到本地笔记库")
                      }
                      title={
                        savedNote
                          ? t("在笔记库中查看")
                          : destination
                            ? t("保存到「{0}」", t(destination.name))
                            : t("保存到本地笔记库")
                      }
                      disabled={savingNote}
                      onClick={async () => {
                        if (savedNote) {
                          await window.readfinch.call("settingsOpen", {
                            tab: "notes",
                            noteId: savedNote,
                          });
                          return;
                        }
                        if (noteAction && !noteAction.noteConnection)
                          setConfirmBook(true);
                        else await saveResult();
                      }}
                    >
                      {savedNote ? <Check size={16} /> : <Bookmark size={16} />}
                    </button>
                  )}
                  {!image &&
                    session?.source === "selection" &&
                    session.selection?.canReplace &&
                    phase === "done" &&
                    activeAction.format === "writing" &&
                    resultSource === session.selection.text && (
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            await window.readfinch.call("replace", {
                              token: session.selection!.token,
                              text: copyableResult(
                                result,
                                "writing",
                                snapshotOutput(activeAction),
                                resultSource,
                              ),
                            });
                            await window.readfinch.call("window", {
                              command: "dismiss",
                            });
                          } catch (error) {
                            setError((error as Error).message);
                          }
                        }}
                      >
                        {t("替换原文")}
                      </button>
                    )}
                </div>
              )}
              {confirmBook && (
                <section
                  className="save-book-prompt"
                  aria-label={t("创建笔记库？")}
                >
                  <strong>{t("创建笔记库？")}</strong>
                  <p>
                    {t(
                      "按「{0}」的输出字段创建本地笔记库，并保存这次结果。",
                      actionLabel(activeAction),
                    )}
                  </p>
                  <button
                    className="secondary compact"
                    onClick={() => setConfirmBook(false)}
                  >
                    {t("取消")}
                  </button>
                  <button
                    className="primary compact"
                    disabled={savingNote}
                    onClick={() => void saveResult(true)}
                  >
                    {t("创建并保存")}
                  </button>
                </section>
              )}
              {noteError && <span role="alert">{noteError}</span>}
              {narration.error && (
                <p className="alert error" role="alert">
                  {narration.error}{" "}
                  <button
                    className="text-button"
                    onClick={() =>
                      void window.readfinch.call("settingsOpen", { tab: "tts" })
                    }
                  >
                    {t("文本转语音")}
                  </button>
                </p>
              )}
            </section>
          )}
          {phase === "done" &&
            activeAction?.id === "translate" &&
            cfg.noteSuggestion.enabled &&
            suggestions && (
              <NoteSuggestionCard key={suggestions.id} data={suggestions} />
            )}
          {error && (
            <div className="panel-error" role="alert">
              <p>{t(error)}</p>
              {working && !configured ? (
                <button
                  className="text-button"
                  onClick={() =>
                    void window.readfinch.call("settingsOpen", { tab: "text" })
                  }
                >
                  {t("配置文字模型")}
                  <ArrowUpRight size={14} />
                </button>
              ) : (
                phase === "error" && (
                  <button
                    className="text-button"
                    onClick={() =>
                      kind === "ocr"
                        ? void recognize()
                        : activeAction && void run(activeAction)
                    }
                  >
                    <RotateCcw size={14} />
                    {t("重试")}
                  </button>
                )
              )}
              {kind === "ocr" && (
                <button
                  className="text-button"
                  onClick={() =>
                    void window.readfinch.call("settingsOpen", { tab: "ocr" })
                  }
                >
                  {t("检查识别设置")}
                  <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          )}
          {phase === "cancelled" && (
            <p className="panel-note" role="status">
              {t("已停止")}
              {kind === "ocr"
                ? text
                  ? t("，已识别的部分可继续校对。")
                  : t("，可重新识别或框选其他区域。")
                : result
                  ? t("，已生成的内容仍可复制。")
                  : ""}
            </p>
          )}
        </div>
      </div>
      <footer className="rf-footer">
        {missingSelection ? (
          <span className="microcopy">{t("识别后可翻译、查词或润色")}</span>
        ) : ocrInput ? (
          <select
            className="provider-selector"
            aria-label={t("识别方式")}
            value={ocrProfile}
            disabled={running}
            onChange={(event) => {
              setOcrProfile(event.target.value);
              setPhase("idle");
              setError("");
              setConfidence(undefined);
            }}
          >
            {availableOcr.map((item) => (
              <option key={item.id} value={item.id}>
                {item.kind === "offline" ? t(item.name) : item.name}
              </option>
            ))}
          </select>
        ) : (
          <ProviderSelect
            config={cfg}
            value={providerId}
            label={t("文字提供商")}
            onChange={(id) => {
              const p = cfg.providers.find((p) => p.id === id);
              if (!p) return;
              const ref = { providerId: p.id, model: p.model };
              setProviderId(p.id);
              modelChoice.current = { actionId: activeAction?.id ?? null, ref };
              if (activeAction?.id === "translate")
                rememberTranslation({ providerId: p.id });
              if (activeAction) void run(activeAction, ref);
            }}
          />
        )}
        <span className="grow" />
        <button
          className="icon-button"
          aria-label={t("打开设置")}
          title={working ? t("配置指令") : t("设置")}
          onClick={() =>
            void window.readfinch.call("settingsOpen", {
              tab: ocrInput
                ? "ocr"
                : missingSelection
                  ? "general"
                  : working
                    ? "actions"
                    : "text",
              actionId: working ? activeAction.id : undefined,
            })
          }
        >
          <ReferenceIcon name="tabler-tool" />
        </button>
        {running ? (
          <button
            className="icon-button"
            aria-label={t("停止")}
            title={t("停止")}
            onClick={stop}
          >
            <Square size={14} />
          </button>
        ) : (
          !missingSelection &&
          (ocrInput || working) && (
            <button
              className="icon-button"
              aria-label={ocrInput ? t("重新识别") : t("重新生成")}
              title={ocrInput ? t("重新识别") : t("重新生成")}
              disabled={!ocrInput && (!text || !activeAction)}
              onClick={() =>
                ocrInput
                  ? void recognize(true)
                  : activeAction &&
                    void run(activeAction, undefined, undefined, true)
              }
            >
              <ReferenceIcon name="tabler-refresh" />
            </button>
          )
        )}
      </footer>
    </div>
  );
}
