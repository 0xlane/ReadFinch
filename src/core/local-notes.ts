import type { Config } from "../shared/config";
import { legacyBookId, type LocalNotebase } from "../shared/notebases";
import { DatabaseSync } from "node:sqlite";
import { digest } from "./store";
import { parseOutput, type OutputView } from "../shared/action-output";
import {
  NoteInputSchema,
  NOTE_PAGE_SIZE,
  type NoteInput,
  type LocalNote,
  type NotePage,
  type NoteQuery,
  type NoteSummary,
} from "../shared/notes";

export class LocalNotes {
  private connection?: DatabaseSync;
  constructor(private readonly file: string) {}
  private db() {
    if (!this.connection) {
      const db = new DatabaseSync(this.file);
      db.exec(`CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, notebook TEXT NOT NULL,
        actionId TEXT NOT NULL, actionName TEXT NOT NULL, format TEXT NOT NULL,
        source TEXT NOT NULL, result TEXT NOT NULL, sourceApp TEXT NOT NULL,
        model TEXT NOT NULL, targetLanguage TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT ''
      ); CREATE INDEX IF NOT EXISTS notes_by_date ON notes(created DESC);`);
      if (
        !db
          .prepare("PRAGMA table_info(notes)")
          .all()
          .some((column) => column.name === "excerpt")
      )
        db.exec(
          "ALTER TABLE notes ADD COLUMN excerpt TEXT NOT NULL DEFAULT ''",
        );
      if (
        !db
          .prepare("PRAGMA table_info(notes)")
          .all()
          .some((c) => c.name === "outputView")
      )
        db.exec("ALTER TABLE notes ADD COLUMN outputView TEXT");
      if (
        !db
          .prepare("PRAGMA table_info(notes)")
          .all()
          .some((c) => c.name === "title")
      )
        db.exec("ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT ''");
      const columns = db.prepare("PRAGMA table_info(notes)").all();
      if (!columns.some((c) => c.name === "notebaseId"))
        db.exec("ALTER TABLE notes ADD COLUMN notebaseId TEXT");
      if (!columns.some((c) => c.name === "cells"))
        db.exec("ALTER TABLE notes ADD COLUMN cells TEXT");
      this.connection = db;
    }
    return this.connection;
  }
  // Recover historical destinations even when the creating action was deleted.
  legacyBooks(config: Config): LocalNotebase[] {
    const books = new Map<string, LocalNotebase>();
    const rows = this.db()
      .prepare(
        "SELECT DISTINCT notebook, outputView FROM notes WHERE notebaseId IS NULL",
      )
      .all();
    for (const row of rows) {
      const name = String(row.notebook),
        id = legacyBookId(name);
      if (config.localNotebases.some((b) => b.id === id)) continue;
      const book =
        books.get(id) ?? ({ id, name, columns: [] } as LocalNotebase);
      const view: OutputView | undefined = row.outputView
        ? JSON.parse(String(row.outputView))
        : undefined;
      for (const f of view?.outputSchema ?? [
        { name: "原文", type: "string" as const },
        { name: "结果", type: "string" as const },
      ]) {
        if (
          !book.columns.some((c) => c.name === f.name) &&
          book.columns.length < 512
        )
          book.columns.push({
            id: "column-" + (book.columns.length + 1),
            name: f.name,
            type: f.type,
          });
      }
      books.set(id, book);
    }
    return [...books.values()];
  }
  indexLegacyBooks(books: LocalNotebase[]) {
    const db = this.db(),
      update = db.prepare(
        "UPDATE notes SET notebaseId=? WHERE notebaseId IS NULL AND notebook=?",
      );
    db.exec("BEGIN");
    try {
      for (const book of books)
        if (book.id === legacyBookId(book.name)) update.run(book.id, book.name);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  save(input: NoteInput) {
    const n = NoteInputSchema.parse(input);
    if (n.outputView) parseOutput(n.result, n.outputView.outputSchema);
    const id = digest([
      n.notebaseId ?? n.notebook,
      n.actionId,
      n.source,
      n.result,
      n.sourceApp,
      n.model,
      n.targetLanguage,
      n.format,
      ...(n.excerpt ? [n.excerpt] : []),
      ...(n.outputView ? [n.outputView] : []),
      ...(n.title ? [n.title] : []),
    ]);
    this.db()
      .prepare(
        "INSERT OR IGNORE INTO notes (id, created, notebook, actionId, actionName, format, source, result, sourceApp, model, targetLanguage, excerpt, outputView,title,notebaseId,cells) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        Date.now(),
        n.notebook,
        n.actionId,
        n.actionName,
        n.format,
        n.source,
        n.result,
        n.sourceApp,
        n.model,
        n.targetLanguage,
        n.excerpt ?? "",
        n.outputView ? JSON.stringify(n.outputView) : null,
        n.title ?? "",
        n.notebaseId ?? null,
        n.cells ? JSON.stringify(n.cells) : null,
      );
    return id;
  }
  saveMany(inputs: NoteInput[]) {
    const db = this.db();
    db.exec("BEGIN IMMEDIATE");
    try {
      const ids = inputs.map((input) => this.save(input));
      db.exec("COMMIT");
      return ids;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  list({
    search,
    notebook,
    offset,
    focusId,
    notebaseId = "",
  }: NoteQuery): NotePage {
    const db = this.db();
    if (focusId && !search && !notebook && !notebaseId) {
      const position = db
        .prepare(
          "SELECT count(*) AS n FROM notes WHERE (created,rowid) > (SELECT created,rowid FROM notes WHERE id=?)",
        )
        .get(focusId);
      offset =
        Math.floor(Number(position?.n ?? 0) / NOTE_PAGE_SIZE) * NOTE_PAGE_SIZE;
    }
    const where =
      " WHERE (? = '' OR notebaseId = ?) AND (? = '' OR notebook = ?) AND (? = '' OR instr(lower(source), lower(?)) OR instr(lower(result), lower(?)) OR instr(lower(actionName), lower(?)) OR instr(lower(excerpt), lower(?)))";
    const args = [
      notebaseId,
      notebaseId,
      notebook,
      notebook,
      search,
      search,
      search,
      search,
      search,
    ];
    const notes = db
      .prepare(
        "SELECT id, created, substr(coalesce(nullif(title,''),source),1,160) AS source, actionName, notebook FROM notes" +
          where +
          " ORDER BY created DESC, rowid DESC LIMIT ? OFFSET ?",
      )
      .all(...args, NOTE_PAGE_SIZE, offset) as NoteSummary[];
    return {
      notes,
      offset,
      total: Number(
        db.prepare("SELECT count(*) AS n FROM notes" + where).get(...args)!.n,
      ),
      destinations: db
        .prepare(
          "SELECT notebaseId AS id, max(notebook) AS name FROM notes WHERE notebaseId IS NOT NULL GROUP BY notebaseId ORDER BY name",
        )
        .all()
        .map((r) => ({ id: String(r.id), name: String(r.name) })),
      notebooks: db
        .prepare("SELECT DISTINCT notebook FROM notes ORDER BY notebook")
        .all()
        .map((n) => String(n.notebook)),
    };
  }
  get(id: string) {
    const row = this.db().prepare("SELECT * FROM notes WHERE id = ?").get(id);
    if (!row) return null;
    const { outputView, cells, notebaseId, ...note } = row;
    return {
      ...note,
      ...(notebaseId ? { notebaseId: String(notebaseId) } : {}),
      ...(cells ? { cells: JSON.parse(String(cells)) } : {}),
      ...(outputView
        ? { outputView: JSON.parse(String(outputView)) as OutputView }
        : {}),
    } as LocalNote;
  }
  delete(id: string) {
    this.db().prepare("DELETE FROM notes WHERE id = ?").run(id);
  }
  close() {
    this.connection?.close();
    this.connection = undefined;
  }
}
