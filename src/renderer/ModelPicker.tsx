import { t } from "../shared/i18n";
import { useEffect, useId, useRef, useState, Fragment } from "react";
import { Check, ChevronDown, Image, RefreshCw, Volume2 } from "lucide-react";
import type { Config, TextProfile } from "../shared/config";
import {
  isCustomProvider,
  canDiscoverModels,
} from "../shared/provider-presets";
import { catalogKey, modelOptions } from "../shared/models";
import {
  chooseProviderModel,
  toggleCustomModel,
} from "../shared/provider-model";

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
  onChange: (provider: TextProfile) => void;
  label: string;
  placeholder: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [empty, setEmpty] = useState(false);
  const key = catalogKey(provider);
  const currentKey = useRef(key);
  currentKey.current = key;
  const customOnly = isCustomProvider(provider.preset);
  const custom = customOnly || provider.customModel;
  const options = modelOptions(config, provider.id, catalogs[key] ?? []);
  const ordered = [
    ...options.filter((m) => m.kind !== "speech"),
    ...options.filter((m) => m.kind === "speech"),
  ];
  const choices = ordered.filter((m) =>
    m.id.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const manual = query.trim();
  const canAdd =
    !custom &&
    !!manual &&
    !/\s/.test(manual) &&
    !choices.some((m) => m.id === manual);
  const count = choices.length + Number(canAdd);
  const active = Math.min(index, count - 1);
  const capability = options.find((m) => m.id === provider.model)?.vision;
  function place() {
    const rect = input.current!.getBoundingClientRect();
    const top =
      input.current!.closest("main")?.getBoundingClientRect().top ?? 0;
    setAbove(
      innerHeight - rect.bottom < 220 &&
        rect.top - top > innerHeight - rect.bottom,
    );
  }
  function close() {
    setOpen(false);
    setEditing(false);
    setQuery("");
  }
  function show() {
    if (open) return;
    place();
    setOpen(true);
    setQuery("");
    setEditing(false);
    setIndex(
      Math.max(
        0,
        ordered.findIndex((m) => m.id === provider.model),
      ),
    );
  }
  function choose(model: string, manualChoice = false) {
    onChange(chooseProviderModel(provider, model, custom || manualChoice));
    close();
    setError("");
    setEmpty(false);
    input.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    currentKey.current = key;
    close();
    setError("");
    setEmpty(false);
    setBusy(false);
    return () => {
      currentKey.current = "";
    };
  }, [key]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
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
  useEffect(() => {
    if (!open || active < 0) return;
    const frame = requestAnimationFrame(() => {
      const row = document.getElementById(id + "-" + active);
      const list = row?.parentElement?.closest(
        '[role="listbox"]',
      ) as HTMLElement | null;
      if (!row || !list) return;
      if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
      else if (
        row.offsetTop + row.offsetHeight >
        list.scrollTop + list.clientHeight
      )
        list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, active, id, query]);
  async function refresh() {
    if (!fetchModels || busy) return;
    const scope = key;
    setBusy(true);
    setError("");
    setEmpty(false);
    try {
      const models = await fetchModels(provider.id);
      if (currentKey.current !== scope) return;
      setEmpty(models.length === 0);
      if (models.length) {
        input.current?.focus({ preventScroll: true });
        place();
        setQuery("");
        setEditing(false);
        setIndex(0);
        setOpen(true);
      }
    } catch (e) {
      if (currentKey.current === scope) setError((e as Error).message);
    } finally {
      if (currentKey.current === scope) setBusy(false);
    }
  }
  return (
    <div
      className="model-input-field"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <div className="provider-field-heading">
        <span>{label}</span>
        <div className="provider-model-tools">
          {capability && (
            <span>
              <Image size={12} /> {t("图片输入")}
            </span>
          )}
          {fetchModels && canDiscoverModels(provider) && (
            <button
              type="button"
              className="model-fetch-button"
              disabled={busy}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void refresh()}
            >
              <RefreshCw size={13} className={busy ? "spin" : ""} />
              {t(busy ? "获取中…" : error ? "重试获取模型" : "获取模型列表")}
            </button>
          )}
        </div>
      </div>
      <div className="model-anchor">
        <input
          ref={input}
          role="combobox"
          aria-label={custom ? t("自定义模型 ID") : label}
          maxLength={200}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id}
          aria-activedescendant={
            open && active >= 0 ? id + "-" + active : undefined
          }
          placeholder={
            custom ? t("输入自定义模型 ID") : open ? t("搜索模型") : placeholder
          }
          value={
            custom ? provider.model : open && editing ? query : provider.model
          }
          onFocus={(e) => {
            if (!custom) {
              show();
              e.currentTarget.select();
            }
          }}
          onClick={() => {
            if (!custom) show();
          }}
          onChange={(e) => {
            if (custom)
              onChange(chooseProviderModel(provider, e.target.value, true));
            else show();
            setQuery(e.target.value);
            setEditing(true);
            setIndex(0);
          }}
          onBlur={(e) => {
            if (custom && e.target.value !== e.target.value.trim())
              onChange(
                chooseProviderModel(provider, e.target.value.trim(), true),
              );
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
              return;
            }
            if (e.key === "Enter" && open && active >= 0) {
              e.preventDefault();
              const option = choices[active];
              choose(
                option?.id ?? manual,
                !option || option.source !== "builtin",
              );
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) show();
              else
                setIndex(
                  Math.max(
                    0,
                    Math.min(
                      count - 1,
                      active + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  ),
                );
            }
            if (open && (e.key === "Home" || e.key === "End")) {
              e.preventDefault();
              setIndex(e.key === "Home" ? 0 : Math.max(0, count - 1));
            }
          }}
        />
        <button
          type="button"
          className="model-chevron"
          aria-label={t(open ? "收起模型列表" : "展开模型列表")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (open) close();
            else {
              input.current?.focus({ preventScroll: true });
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
                <Fragment key={m.id}>
                  {m.kind === "speech" && choices[i - 1]?.kind !== "speech" && (
                    <div className="model-group-label">{t("语音模型")}</div>
                  )}
                  <button
                    type="button"
                    role="option"
                    id={id + "-" + i}
                    tabIndex={-1}
                    aria-selected={m.id === provider.model}
                    data-active={i === active}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => choose(m.id, m.source !== "builtin")}
                  >
                    <span>{m.id}</span>
                    {m.vision && <Image size={13} aria-label={t("图片输入")} />}
                    {m.kind === "speech" && (
                      <Volume2 size={13} aria-label={t("语音模型")} />
                    )}
                    {m.id === provider.model && <Check size={14} />}
                  </button>
                </Fragment>
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
              {!count && <p>{t("没有匹配的模型，可直接输入自定义 ID。")}</p>}
            </div>
          </div>
        )}
      </div>
      {!customOnly && (
        <label className="custom-model-check">
          <input
            type="checkbox"
            checked={custom}
            onChange={(e) => {
              close();
              setError("");
              setEmpty(false);
              onChange(toggleCustomModel(provider, e.target.checked));
            }}
          />
          {t("输入自定义模型 ID")}
        </label>
      )}
      {empty && (
        <p className="model-fetch-note" role="status">
          {t("接口未返回模型，可直接输入自定义 ID。")}
        </p>
      )}
      {error && (
        <p className="model-fetch-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
