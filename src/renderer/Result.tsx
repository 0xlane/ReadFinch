import { t } from "../shared/i18n";
import { speakText, useSpeechStatus } from "./speech";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { WritingResult } from "./WritingResult";
import { Volume2 } from "lucide-react";
import type { Action } from "../shared/config";
import {
  displayFields,
  streamingValues,
  type OutputView,
} from "../shared/action-output";
import { SchemaResult } from "./SchemaResult";
function structured(text: string, partial = false) {
  const body = text
    .trimStart()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const value = JSON.parse(body);
    if (value && typeof value === "object" && !Array.isArray(value))
      return value as Record<string, unknown>;
  } catch {}
  if (partial && body.startsWith("{")) {
    const fields: Record<string, unknown> = {};
    for (const match of body.matchAll(
      /"(\w+)"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/g,
    )) {
      try {
        fields[match[1]] = JSON.parse(
          '"' + match[2].replace(/\\u[0-9a-f]{0,3}$/i, "") + '"',
        );
      } catch {}
    }
    if (Object.keys(fields).length) return fields;
  }
  return null;
}
const string = (v: unknown) => (typeof v === "string" ? v : "");
export function copyableResult(
  text: string,
  format: Action["format"],
  view?: OutputView,
  selection = "",
) {
  if (view) {
    const fields = displayFields(
      view.outputSchema,
      streamingValues(text),
      selection,
    );
    const revision = fields.find(
      (f) => f.id === "improve-writing-improved",
    )?.value;
    if (format === "writing" && typeof revision === "string") return revision;
    return fields
      .filter((f) => f.value !== null && f.value !== "")
      .map((f) =>
        fields.length === 1 ? String(f.value) : f.name + "\n" + f.value,
      )
      .join("\n\n");
  }
  const data = structured(text);
  return format === "writing" && (data?.revision || data?.improved)
    ? string(data.revision || data.improved)
    : text;
}
export function Speak({ text, language }: { text: string; language?: string }) {
  const speech = useSpeechStatus();
  const playing =
    speech.key === text &&
    (speech.status === "playing" || speech.status === "loading");
  const label = playing ? t("停止朗读") : t("朗读");
  return (
    <button
      className="icon-button"
      aria-label={label}
      title={speech.key === text && speech.error ? speech.error : label}
      aria-pressed={playing}
      disabled={!text.trim()}
      onClick={() => void speakText(text, language)}
    >
      {playing ? <span aria-hidden="true">■</span> : <Volume2 size={17} />}
    </button>
  );
}
export function Result({
  text,
  format,
  source,
  finished,
  view,
  targetLanguage = "",
  status,
  autoplay,
}: {
  text: string;
  format: Action["format"];
  source: string;
  finished: boolean;
  view?: OutputView;
  targetLanguage?: string;
  status?: string;
  autoplay?: boolean;
}) {
  if (view)
    return (
      <SchemaResult
        view={view}
        text={text}
        source={source}
        targetLanguage={targetLanguage}
        finished={finished}
        status={status}
        autoplay={autoplay}
      />
    );
  const data = structured(text, !finished);
  if (!finished && !data && format !== "markdown")
    return <span className="stream-caret" aria-label={t("正在生成")} />;
  if (data && format === "dictionary")
    return (
      <div className="dictionary">
        <div className="word-heading">
          <h2>{string(data.term) || source}</h2>
          <Speak text={string(data.term) || source} />
          {!!data.difficulty && (
            <span className="difficulty">{string(data.difficulty)}</span>
          )}
        </div>
        <div className="phonetic">
          {string(data.phonetic)}{" "}
          {!!data.partOfSpeech && <span>{string(data.partOfSpeech)}</span>}
        </div>
        <p className="definition">
          {string(data.definition)}
          {!finished && <span className="stream-caret" />}
        </p>
        {!!data.example && (
          <div className="example">
            <p>{string(data.example)}</p>
            {!!data.translation && <small>{string(data.translation)}</small>}
          </div>
        )}
        {!!data.memoryTips && (
          <details className="memory-tips">
            <summary>{t("记忆提示")}</summary>
            {string(data.memoryTips)
              .split("\n")
              .map((tip, index) => (
                <p key={index}>{tip}</p>
              ))}
          </details>
        )}
      </div>
    );
  if (data && format === "writing")
    return (
      <>
        <WritingResult
          data={data}
          source={source}
          pending={!finished && status !== "error"}
        />
        {!finished && <span className="stream-caret" />}
      </>
    );
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children }) => <span className="text-link">{children}</span>,
          img: () => null,
        }}
      >
        {text}
      </ReactMarkdown>
      {!finished && <span className="stream-caret" />}
    </div>
  );
}
