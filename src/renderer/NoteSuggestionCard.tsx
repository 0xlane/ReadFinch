import { useState } from "react";
import { ArrowUpRight, BookmarkPlus, BookOpen, Check } from "lucide-react";
import { t } from "../shared/i18n";
import type { SuggestionCardData } from "../shared/notes";

export function NoteSuggestionCard({ data }: { data: SuggestionCardData }) {
  const [selected, setSelected] = useState(() => data.items.map(() => true));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  async function save(create = false) {
    setBusy(true);
    setError("");
    try {
      const indexes = selected.flatMap((checked, index) =>
        checked ? [index] : [],
      );
      const [id] = await window.readfinch.call("saveSuggestions", {
        id: data.id,
        indexes,
        create,
      });
      setSaved(id);
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="suggestion-card" aria-label={t("猜你想存")}>
      <header>
        <h3>
          <BookmarkPlus size={16} aria-hidden="true" />
          {t("猜你想存")}
        </h3>
        <button
          type="button"
          className="suggestion-toggle"
          role="switch"
          aria-checked="true"
          aria-label={t("显示猜你想存")}
          disabled={busy}
          onClick={() =>
            void window.readfinch
              .call("disableNoteSuggestions")
              .catch((e) => setError(e.message))
          }
        >
          <span aria-hidden="true" />
          {t("显示猜你想存")}
        </button>
      </header>
      <p>{t("勾选想要复习的词或短语。")}</p>
      <div className="suggestion-choices">
        {data.items.map(({ term, summary }, i) => (
          <label key={term}>
            <input
              type="checkbox"
              checked={selected[i]}
              disabled={busy || !!saved}
              aria-label={term}
              onChange={(e) =>
                setSelected(
                  selected.map((v, j) => (j === i ? e.target.checked : v)),
                )
              }
            />
            <span>
              <strong>{term}</strong>
              <small>{summary}</small>
            </span>
          </label>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {confirm && (
        <div className="save-book-prompt">
          <strong>{t("创建笔记库？")}</strong>
          <p>
            {t(
              "按「{0}」的输出字段创建本地笔记库，并保存所选词条。",
              data.notebook,
            )}
          </p>
          <button
            className="secondary compact"
            onClick={() => setConfirm(false)}
          >
            {t("取消")}
          </button>
          <button
            className="primary compact"
            disabled={busy}
            onClick={() => void save(true)}
          >
            {t("创建并保存")}
          </button>
        </div>
      )}
      <footer>
        {saved ? (
          <button
            className="text-button suggestion-link"
            onClick={() =>
              void window.readfinch
                .call("settingsOpen", { tab: "notes", noteId: saved })
                .catch((e) => setError(e.message))
            }
          >
            <BookOpen size={14} />
            {t(data.notebook)}
            <ArrowUpRight size={13} />
          </button>
        ) : (
          <span className="suggestion-book">
            <BookOpen size={14} />
            {t(data.notebook)}
          </span>
        )}
        <button
          className="primary suggestion-save"
          disabled={busy || confirm || !!saved || !selected.some(Boolean)}
          onClick={() =>
            data.needsConnection ? setConfirm(true) : void save()
          }
        >
          {saved && <Check size={14} />}
          {t(saved ? "已保存" : busy ? "保存中…" : "保存")}
        </button>
      </footer>
    </section>
  );
}
