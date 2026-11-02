import { t } from "../shared/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Image, RefreshCw } from "lucide-react";
import type { Config, TextProfile } from "../shared/config";
import { catalogKey, modelOptions } from "../shared/models";

export type ModelCatalogAccess = {
  catalogs?: Record<string, string[]>;
  fetchModels?: (providerId: string) => Promise<string[]>;
};
export function ModelPicker({
  config,
  provider,
  onChange,
  label,
  placeholder,
  catalogs = {},
  fetchModels,
}: ModelCatalogAccess & {
  config: Config;
  provider: TextProfile;
  onChange: (model: string, custom: boolean) => void;
  label: string;
  placeholder: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choices = modelOptions(
    config,
    provider.id,
    catalogs[catalogKey(provider)] ?? [],
  )
    .filter((m) => m.id.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 100);
  const manual = query.trim();
  const canAdd =
    !!manual && !/\s/.test(manual) && !choices.some((m) => m.id === manual);
  const count = choices.length + Number(canAdd);
  const active = Math.min(index, count - 1);
  function place() {
    const rect = input.current!.getBoundingClientRect(),
      top = input.current!.closest("main")?.getBoundingClientRect().top ?? 0;
    setAbove(
      innerHeight - rect.bottom < 170 &&
        rect.top - top > innerHeight - rect.bottom,
    );
  }
  function show() {
    if (open) return;
    place();
    setOpen(true);
    setQuery("");
    setIndex(0);
  }
  function choose(model: string, custom = false) {
    onChange(model, custom);
    setOpen(false);
    setError("");
    input.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);
  async function refresh() {
    if (!fetchModels || busy) return;
    setBusy(true);
    setError("");
    try {
      await fetchModels(provider.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="model-input-field"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <div className="model-anchor">
        {provider.customModel ? (
          <input
            ref={input}
            aria-label={t("自定义模型 ID")}
            placeholder={t("输入自定义模型 ID")}
            maxLength={200}
            value={provider.model}
            onChange={(e) => onChange(e.target.value, true)}
            onBlur={(e) => onChange(e.target.value.trim(), true)}
          />
        ) : (
          <>
            <input
              role="combobox"
              aria-label={label}
              maxLength={200}
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={id}
              aria-activedescendant={
                open && active >= 0 ? id + "-" + active : undefined
              }
              ref={input}
              placeholder={open ? t("搜索模型") : placeholder}
              value={open ? query : provider.model}
              onFocus={show}
              onClick={show}
              onChange={(e) => {
                show();
                setQuery(e.target.value);
                setIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                  return;
                }
                if (e.key === "Enter" && open && active >= 0) {
                  e.preventDefault();
                  choose(choices[active]?.id ?? manual, !choices[active]);
                }
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  show();
                  const next = open
                    ? Math.max(
                        0,
                        Math.min(
                          count - 1,
                          active + (e.key === "ArrowDown" ? 1 : -1),
                        ),
                      )
                    : 0;
                  setIndex(next);
                  const row = document.getElementById(id + "-" + next);
                  if (row?.parentElement) {
                    const list = row.parentElement;
                    if (row.offsetTop < list.scrollTop)
                      list.scrollTop = row.offsetTop;
                    else if (
                      row.offsetTop + row.offsetHeight >
                      list.scrollTop + list.clientHeight
                    )
                      list.scrollTop =
                        row.offsetTop + row.offsetHeight - list.clientHeight;
                  }
                }
              }}
            />
            <button
              type="button"
              className="model-chevron"
              aria-label={t(open ? "收起模型列表" : "展开模型列表")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (open) setOpen(false);
                else {
                  input.current?.focus();
                  show();
                }
              }}
            >
              <ChevronDown size={15} />
            </button>
            {open && (
              <div className="model-dropdown" data-above={above}>
                <div role="listbox" id={id} aria-label={t("模型候选")}>
                  {choices.map((m, i) => (
                    <button
                      type="button"
                      role="option"
                      key={m.id}
                      id={id + "-" + i}
                      tabIndex={-1}
                      aria-selected={m.id === provider.model}
                      data-active={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setIndex(i)}
                      onClick={() => choose(m.id)}
                    >
                      <span>{m.id}</span>
                      {m.vision && (
                        <Image size={13} aria-label={t("图片输入")} />
                      )}
                      {m.id === provider.model && <Check size={14} />}
                    </button>
                  ))}
                  {canAdd && (
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      tabIndex={-1}
                      id={id + "-" + choices.length}
                      data-active={active === choices.length}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setIndex(choices.length)}
                      onClick={() => choose(manual, true)}
                    >
                      <span>{t("使用自定义 ID「{0}」", manual)}</span>
                    </button>
                  )}
                  {!count && (
                    <p>{t("没有匹配的模型，可在下方启用自定义 ID。")}</p>
                  )}
                </div>
                {fetchModels && (
                  <button
                    className="model-refresh"
                    disabled={busy}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={13} className={busy ? "spin" : ""} />
                    {t("获取模型列表")}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <label className="custom-model-check">
        <input
          type="checkbox"
          checked={provider.customModel}
          onChange={(e) => {
            setOpen(false);
            setError("");
            onChange(provider.model, e.target.checked);
          }}
        />
        {t("输入自定义模型 ID")}
      </label>
      {error && (
        <p className="model-fetch-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
