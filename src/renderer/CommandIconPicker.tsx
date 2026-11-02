import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import {
  catalogIcons,
  defaultIconId,
  featuredIcons,
  iconPosition,
  iconSets,
  legacyIcons,
  setLabels,
  type IconSet,
} from "../shared/icons";
import { t } from "../shared/i18n";
import { ActionIcon } from "./ui";

const aliases: Record<string, string> = {
  书: "book",
  笔记: "note",
  语言: "language",
  翻译: "translat",
  写作: "pencil",
  词典: "dictionary",
  代码: "code",
  学习: "school",
  聊天: "message",
  收藏: "bookmark",
  爱心: "heart",
  星: "star",
  灯: "bulb",
  科学: "science",
  音乐: "music",
  动物: "animal",
  植物: "plant",
  花: "flower",
  相机: "camera",
  图片: "photo",
  时间: "clock",
  天气: "cloud",
  箭头: "arrow",
  颜色: "color",
  工具: "tool",
  文件: "file",
};
export function CommandIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const current = defaultIconId[value as (typeof legacyIcons)[number]] ?? value;
  const [draft, setDraft] = useState(current),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const [family, setFamily] = useState<"featured" | IconSet>("featured"),
    [page, setPage] = useState(0);
  const [placement, setPlacement] = useState({ above: false, height: 340 });
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    search = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(current), [current]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const field = root.current!,
        rect = field.getBoundingClientRect();
      const container = field.closest("main")!.getBoundingClientRect();
      const top = rect.top - container.top - 8,
        bottom = container.bottom - rect.bottom - 8;
      const above = bottom < 332 && top > bottom;
      const height = Math.max(90, Math.floor(above ? top : bottom));
      setPlacement((old) =>
        old.above === above && old.height === height ? old : { above, height },
      );
    };
    place();
    document.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const q = query.trim().toLowerCase(),
    keyword = aliases[q] ?? q;
  const featured = featuredIcons
    .filter((i) => !q || i.zh.includes(q) || i.id.includes(keyword))
    .map((i) => i.id);
  const matches =
    family === "featured" && !q
      ? featured
      : catalogIcons.filter(
          (id) =>
            (family === "featured" || id.startsWith(family + ":")) &&
            (id.includes(keyword) || featured.includes(id)),
        );
  const size = 48,
    pages = Math.ceil(matches.length / size);
  function choose(icon: string) {
    onChange(icon);
    setDraft(icon);
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div
      className="field command-icon-field"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
          setDraft(current);
          trigger.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label className="field-label" htmlFor={id}>
        {t("图标")}
      </label>
      <div className="command-icon-input">
        <button
          type="button"
          className="glyph-trigger"
          ref={trigger}
          aria-label={t("选择指令图标")}
          aria-expanded={open}
          title={t("选择指令图标")}
          onClick={() => {
            if (!open) {
              setQuery("");
              setPage(0);
              setFamily("featured");
            }
            setOpen(!open);
          }}
        >
          <ActionIcon icon={value} size={22} />
        </button>
        <input
          id={id}
          aria-label={t("图标 ID")}
          value={draft}
          spellCheck={false}
          maxLength={140}
          aria-invalid={!iconPosition(draft.trim())}
          onChange={(e) => {
            const v = e.target.value.trim();
            setDraft(e.target.value);
            if (iconPosition(v)) onChange(v);
          }}
        />
      </div>
      {draft !== current && !iconPosition(draft.trim()) && (
        <small role="status">
          {t("请输入本地图标库中的完整 ID，例如 tabler:book-2。")}
        </small>
      )}
      {open && (
        <div
          className="glyph-popover"
          data-above={placement.above}
          style={{ maxHeight: placement.height }}
          role="dialog"
          aria-label={t("选择指令图标")}
        >
          <header>
            <strong>{t("选择图标")}</strong>
            <button
              className="icon-button"
              aria-label={t("关闭图标选择器")}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={15} />
            </button>
          </header>
          <label className="glyph-search">
            <Search size={15} />
            <input
              ref={search}
              aria-label={t("搜索图标")}
              placeholder={t("搜索名称或 Iconify ID")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <div className="glyph-families">
            {(["featured", ...iconSets] as const).map((set) => (
              <button
                key={set}
                aria-pressed={family === set}
                onClick={() => {
                  setFamily(set);
                  setPage(0);
                }}
              >
                {set === "featured" ? t("常用") : setLabels[set]}
              </button>
            ))}
          </div>
          <div className="glyph-grid" role="group" aria-label={t("图标候选")}>
            {matches.slice(page * size, (page + 1) * size).map((icon) => (
              <button
                key={icon}
                aria-label={icon}
                title={icon}
                aria-pressed={icon === current}
                onClick={() => choose(icon)}
              >
                <ActionIcon icon={icon} size={20} />
              </button>
            ))}
          </div>
          {!matches.length && (
            <div className="glyph-empty">{t("没有匹配的图标")}</div>
          )}
          <footer>
            <span>
              {t(
                "本地图标 {0} 个",
                catalogIcons.length.toLocaleString(
                  document.documentElement.lang,
                ),
              )}
            </span>
            {pages > 1 && (
              <>
                <span className="grow" />
                <button
                  className="icon-button"
                  aria-label={t("上一页")}
                  disabled={!page}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={14} />
                </button>
                <small>
                  {page + 1}/{pages}
                </small>
                <button
                  className="icon-button"
                  aria-label={t("下一页")}
                  disabled={page >= pages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={14} />
                </button>
              </>
            )}
          </footer>
        </div>
      )}
    </div>
  );
}
