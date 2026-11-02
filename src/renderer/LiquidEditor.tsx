import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
} from "@codemirror/view";
import { liquid } from "@codemirror/lang-liquid";
import { fieldExpression, type OutputField } from "../shared/action-output";

export type LiquidHandle = { insert: (snippet: string) => void };
export default function LiquidEditor({
  value,
  fields,
  locked,
  onChange,
  handle,
}: {
  value: string;
  fields: OutputField[];
  locked: boolean;
  onChange: (s: string) => void;
  handle: Ref<LiquidHandle>;
}) {
  const root = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    notify = useRef(onChange);
  notify.current = onChange;
  useImperativeHandle(
    handle,
    () => ({
      insert(snippet) {
        const editor = view.current;
        if (!editor || locked) return;
        editor.dispatch(editor.state.replaceSelection(snippet));
        editor.focus();
      },
    }),
    [locked],
  );
  useLayoutEffect(() => {
    const decorator = new MatchDecorator({
      regexp: /\[\s*"(?:\\.|[^"\\])*"\s*\]/g,
      decoration: Decoration.mark({ class: "cm-field-ref" }),
    });
    const marks = ViewPlugin.fromClass(
      class {
        decorations;
        constructor(editor: EditorView) {
          this.decorations = decorator.createDeco(editor);
        }
        update(change: import("@codemirror/view").ViewUpdate) {
          this.decorations = decorator.updateDeco(change, this.decorations);
        }
      },
      { decorations: (plugin) => plugin.decorations },
    );
    const editor = new EditorView({
      parent: root.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          liquid({
            variables: [
              { label: "ctx", type: "variable" },
              ...fields.map((f) => ({
                label: f.name,
                apply: fieldExpression(f.name),
                type: "variable",
                detail: f.type,
              })),
            ],
            properties: (path) =>
              path.join(".") === "ctx"
                ? ["selection", "targetLanguage", "fields", "status"].map(
                    (label) => ({ label, type: "property" }),
                  )
                : [],
          }),
          EditorView.lineWrapping,
          EditorState.readOnly.of(locked),
          EditorView.editable.of(!locked),
          EditorView.contentAttributes.of({
            role: "textbox",
            "aria-label": "HTML + Liquid",
            "aria-multiline": "true",
            "aria-readonly": String(locked),
            spellcheck: "false",
          }),
          EditorState.transactionFilter.of((tr) =>
            tr.newDoc.length > 32768 ? [] : tr,
          ),
          marks,
          EditorView.updateListener.of((change) => {
            if (change.docChanged) notify.current(change.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [locked, fields.map((f) => f.id + ":" + f.name).join("\n")]);
  useLayoutEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const old = editor.state.doc.toString();
    if (old === value) return;
    let from = 0,
      end = 0;
    while (
      from < Math.min(old.length, value.length) &&
      old[from] === value[from]
    )
      from++;
    while (
      end < Math.min(old.length - from, value.length - from) &&
      old.at(-1 - end) === value.at(-1 - end)
    )
      end++;
    editor.dispatch({
      changes: {
        from,
        to: old.length - end,
        insert: value.slice(from, value.length - end),
      },
    });
  }, [value]);
  return <div className="liquid-editor" ref={root} />;
}
