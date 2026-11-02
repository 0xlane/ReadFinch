import { useEffect, useState } from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  LibraryBig,
  Search,
  Trash2,
} from "lucide-react";
import { t } from "../shared/i18n";
import { NOTE_PAGE_SIZE, type LocalNote, type NotePage } from "../shared/notes";
import type { LocalNotebase } from "../shared/notebases";
import { Result, copyableResult } from "./Result";

export function LocalNotebook({
  noteId,
  books,
}: {
  noteId?: string;
  books: LocalNotebase[];
}) {
  const [data, setData] = useState<NotePage | null>(null);
  const [search, setSearch] = useState("");
  const [book, setBook] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(noteId ?? "");
  const [focusId, setFocusId] = useState(noteId);
  const [note, setNote] = useState<LocalNote | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(
    () => window.texthop.on("notesChanged", () => setRevision((n) => n + 1)),
    [],
  );
  useEffect(() => {
    let current = true;
    const timer = setTimeout(
      () =>
        void window.texthop
          .call("notesList", {
            search: search.trim(),
            notebook: "",
            notebaseId: book,
            offset,
            focusId,
          })
          .then((page) => {
            if (!current) return;
            if (
              book &&
              !books.some((b) => b.id === book) &&
              !page.destinations.some((b) => b.id === book)
            ) {
              setBook("");
              setOffset(0);
              return;
            }
            if (offset && !page.notes.length) {
              setOffset(Math.max(0, offset - NOTE_PAGE_SIZE));
              return;
            }
            setData(page);
            setError("");
            if (focusId) {
              setOffset(page.offset);
              setFocusId(undefined);
            }
            setSelected((id) =>
              page.notes.some((n) => n.id === id) ? id : "",
            );
          })
          .catch((e) => {
            if (current) setError(e.message);
          }),
      100,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [book, offset, search, revision, focusId, books]);
  useEffect(() => {
    let current = true;
    setNote(null);
    setConfirming(false);
    setCopied(false);
    if (selected)
      void window.texthop
        .call("noteGet", { id: selected })
        .then((n) => {
          if (current) setNote(n);
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    return () => {
      current = false;
    };
  }, [selected, revision]);
  const destinations = [
    ...books,
    ...(data?.destinations ?? []).filter(
      (b) => !books.some((known) => known.id === b.id),
    ),
  ];
  return (
    <div className="page providers-page notebook-page">
      <header className="page-heading">
        <div>
          <h1>{t("本地笔记库")}</h1>
          <p>{t("在这里重读从划词结果中保存的内容。")}</p>
        </div>
      </header>
      <div className="notebook-controls">
        <label className="notebook-search">
          <Search size={17} />
          <input
            aria-label={t("搜索笔记")}
            placeholder={t("搜索原文、释义或结果")}
            maxLength={200}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
              setSelected("");
            }}
          />
        </label>
        <select
          aria-label={t("筛选笔记本")}
          value={book}
          onChange={(e) => {
            setBook(e.target.value);
            setOffset(0);
            setSelected("");
          }}
        >
          <option value="">{t("全部笔记本")}</option>
          {destinations.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {data &&
        (data.notes.length ? (
          <>
            <div className="notes-count">{t("共 {0} 条笔记", data.total)}</div>
            <div className="note-list">
              {data.notes.map((n) => (
                <article key={n.id} data-open={selected === n.id}>
                  <button
                    className="note-row"
                    aria-expanded={selected === n.id}
                    onClick={() => setSelected(selected === n.id ? "" : n.id)}
                  >
                    <span className="note-mark">
                      <Bookmark size={17} />
                    </span>
                    <span className="note-identity">
                      <strong>{n.source}</strong>
                      <small>
                        {t(n.notebook)} · {n.actionName}
                      </small>
                    </span>
                    <time>
                      {new Date(n.created).toLocaleDateString(
                        document.documentElement.lang,
                      )}
                    </time>
                    <ChevronDown size={15} />
                  </button>
                  {note?.id === n.id && selected === n.id && (
                    <div className="note-detail">
                      <h3>{t(note.excerpt ? "选中的原文" : "原文")}</h3>
                      <p className="note-source">
                        {note.excerpt || note.source}
                      </p>
                      <h3>{t("保存的结果")}</h3>
                      <Result
                        source={note.source}
                        text={note.result}
                        format={note.format}
                        view={note.outputView}
                        targetLanguage={note.targetLanguage}
                        finished
                      />
                      <div className="note-provenance">
                        {[
                          note.sourceApp,
                          note.model,
                          new Date(note.created).toLocaleString(
                            document.documentElement.lang,
                          ),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      <footer>
                        <button
                          className="secondary"
                          onClick={async () => {
                            try {
                              await window.texthop.call("clipboardWrite", {
                                text: copyableResult(
                                  note.result,
                                  note.format,
                                  note.outputView,
                                  note.source,
                                ),
                              });
                              setCopied(true);
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
                          {copied ? t("已复制") : t("复制结果")}
                        </button>
                        <span className="grow" />
                        {confirming && (
                          <button
                            className="text-button"
                            onClick={() => setConfirming(false)}
                          >
                            {t("取消")}
                          </button>
                        )}
                        <button
                          className="text-button danger"
                          onClick={async () => {
                            if (!confirming) {
                              setConfirming(true);
                              return;
                            }
                            try {
                              await window.texthop.call("noteDelete", {
                                id: n.id,
                              });
                              setSelected("");
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          <Trash2 size={14} />
                          {confirming ? t("确认删除") : t("删除笔记")}
                        </button>
                      </footer>
                    </div>
                  )}
                </article>
              ))}
            </div>
            {data.total > NOTE_PAGE_SIZE && (
              <div className="notes-pagination">
                <button
                  className="icon-button"
                  disabled={!offset}
                  aria-label={t("上一页")}
                  onClick={() => setOffset(offset - NOTE_PAGE_SIZE)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span>
                  {Math.floor(offset / NOTE_PAGE_SIZE) + 1} /{" "}
                  {Math.ceil(data.total / NOTE_PAGE_SIZE)}
                </span>
                <button
                  className="icon-button"
                  aria-label={t("下一页")}
                  disabled={offset + NOTE_PAGE_SIZE >= data.total}
                  onClick={() => setOffset(offset + NOTE_PAGE_SIZE)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="notes-empty">
            <span>
              {search || book ? <Search size={27} /> : <LibraryBig size={30} />}
            </span>
            <h2>
              {search || book ? t("没有匹配的笔记") : t("还没有保存的笔记")}
            </h2>
            <p>
              {search || book
                ? t("试试其他关键词或笔记本。")
                : t("划选文字，运行指令后，点击结果旁的书签即可保存。")}
            </p>
          </div>
        ))}
    </div>
  );
}
