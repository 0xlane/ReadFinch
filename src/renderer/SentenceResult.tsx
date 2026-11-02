import { useState } from "react";
import { ChevronLeft, ChevronRight, Volume2 } from "lucide-react";
import { annotationSegments, locateAnnotations } from "../shared/annotations";
import { speakText } from "./speech";
import { t } from "../shared/i18n";

const roles: Record<string, string> = {
  subject: "主语",
  predicate: "谓语",
  object: "宾语",
  complement: "补语",
  attributive: "定语",
  adverbial: "状语",
  appositive: "同位语",
  connector: "连接词",
};
export function SentenceResult({
  source,
  marks,
}: {
  source: string;
  marks: string;
}) {
  const [current, setCurrent] = useState(0);
  const [skeleton, setSkeleton] = useState(false),
    [chunks, setChunks] = useState(false);
  const ranges = locateAnnotations(source, marks);
  if (!ranges.length) return <p className="sentence-original">{source}</p>;
  const index = Math.min(current, ranges.length - 1);
  const selected = ranges[index];
  const labelFor = (r: typeof selected) =>
    r.role || t(roles[r.type ?? ""] || "句子成分");
  const modifiers = ranges.filter(
    (r) =>
      r.form === "clause" ||
      [
        "attributive",
        "adverbial",
        "appositive",
        "定语",
        "状语",
        "同位语",
        "从句",
      ].includes(r.type ?? r.role ?? ""),
  );
  const collapsed = modifiers.filter(
    (r) =>
      !modifiers.some(
        (other) =>
          other !== r &&
          other.start <= r.start &&
          other.end >= r.end &&
          other.text.length > r.text.length,
      ),
  );
  const breaks = new Set(
    ranges
      .filter(
        (r) =>
          r.start > 0 &&
          !ranges.some((other) => other.start < r.start && other.end > r.start),
      )
      .map((r) => r.start),
  );
  return (
    <div className="sentence-analysis">
      <div className="sentence-modes">
        <button
          type="button"
          disabled={!collapsed.length}
          aria-pressed={skeleton}
          onClick={() => setSkeleton(!skeleton)}
        >
          {t("只看主干")}
        </button>
        <button
          type="button"
          disabled={!breaks.size}
          aria-pressed={chunks}
          onClick={() => setChunks(!chunks)}
        >
          {t("断句")}
        </button>
      </div>
      <p className="sentence-original">
        {annotationSegments(source, ranges).map((part) => {
          const hidden =
            skeleton &&
            collapsed.find((r) => r.start <= part.start && r.end > part.start);
          if (hidden)
            return part.start === hidden.start ? (
              <button
                key={part.start}
                className="clause-fold"
                title={hidden.text}
                onClick={() => {
                  setSkeleton(false);
                  setCurrent(ranges.indexOf(hidden));
                }}
              >
                {hidden.form === "clause" ? t("从句") : "…"}
              </button>
            ) : null;
          return part.index < 0 || !part.text.trim() ? (
            part.text
          ) : (
            <span
              key={part.start}
              role="button"
              tabIndex={0}
              className="sentence-fragment"
              data-role={ranges[part.index].type}
              data-break={chunks && breaks.has(part.start)}
              data-selected={
                part.start >= selected.start && part.end <= selected.end
              }
              aria-label={[part.text, labelFor(ranges[part.index])]
                .filter(Boolean)
                .join(" · ")}
              onPointerEnter={() => setCurrent(part.index)}
              onFocus={() => setCurrent(part.index)}
              onClick={() => setCurrent(part.index)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setCurrent(part.index);
                }
              }}
            >
              {part.text}
            </span>
          );
        })}
      </p>
      <section className="sentence-inspector" aria-label={t("句子成分")}>
        <div className="sentence-inspector-heading">
          <strong>{labelFor(selected)}</strong>
          <div className="sentence-nav">
            <button
              type="button"
              aria-label={t("朗读原句")}
              title={t("朗读原句")}
              onClick={() => void speakText(source)}
            >
              <Volume2 size={15} />
            </button>
            <button
              type="button"
              aria-label={t("上一处标注")}
              disabled={index === 0}
              onClick={() => setCurrent(index - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <small>
              {index + 1} / {ranges.length}
            </small>
            <button
              type="button"
              aria-label={t("下一处标注")}
              disabled={index === ranges.length - 1}
              onClick={() => setCurrent(index + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
        <div className="sentence-detail" aria-live="polite">
          <span className="sentence-quote">{selected.text}</span>
          {selected.head && (
            <small>
              {t("关联词")} · {selected.head}
            </small>
          )}
          {selected.obstacle && <small>{selected.obstacle}</small>}
          {selected.restore && <p>{selected.restore}</p>}
          {selected.note && <p>{selected.note}</p>}
        </div>
      </section>
    </div>
  );
}
