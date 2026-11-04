import { useLayoutEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { json } from "@codemirror/lang-json";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView, placeholder } from "@codemirror/view";
import { syntaxHighlighting } from "@codemirror/language";
import { classHighlighter } from "@lezer/highlight";

export default function ProviderJsonEditor({
  id,
  value,
  example,
  onChange,
  onBlur,
}: {
  id: string;
  value: string;
  example: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef({ onChange, onBlur });
  handlers.current = { onChange, onBlur };
  useLayoutEffect(() => {
    const editor = new EditorView({
      parent: root.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          json(),
          EditorView.lineWrapping,
          placeholder(example),
          syntaxHighlighting(classHighlighter),
          EditorView.contentAttributes.of({
            id,
            role: "textbox",
            "aria-labelledby": id + "-label",
            "aria-multiline": "true",
            "aria-describedby": id + "-help",
            spellcheck: "false",
          }),
          EditorView.domEventHandlers({
            blur: () => {
              handlers.current.onBlur?.();
            },
          }),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((tr) =>
                tr.annotation(Transaction.remote),
              )
            )
              handlers.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [id, example]);
  useLayoutEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
        annotations: [
          Transaction.remote.of(true),
          Transaction.addToHistory.of(false),
        ],
      });
    }
  }, [value]);
  return <div className="provider-json-editor" ref={root} />;
}
