import { useState } from "react";
import { diffWordsWithSpace } from "diff";
import { locateAnnotations } from "../shared/annotations";
import { t } from "../shared/i18n";
const string = (value: unknown) => (typeof value === "string" ? value : "");
export function WritingResult({
  data,
  source,
}: {
  data: Record<string, unknown>;
  source: string;
}) {
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [showDiff, setShowDiff] = useState(false);
  const [hideFixes, setHideFixes] = useState(false);
  const [showImproved, setShowImproved] = useState(true);
  const revision = string(data.revision || data.improved);
  const summary = string(data.explanation || data.summary);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  const ranges = locateAnnotations(source, data.annotations).sort(
    (a, b) => a.start - b.start,
  );
  for (const [index, item] of ranges.entries()) {
    if (item.start < cursor) continue;
    parts.push(source.slice(cursor, item.start));
    parts.push(
      <span
        key={index}
        tabIndex={0}
        className={
          "writing-annotation " +
          (item.tier === "good"
            ? "good"
            : item.tier === "error"
              ? "error"
              : "awkward")
        }
      >
        {item.text}
        <span className="annotation-tip" role="tooltip">
          <strong>
            {string(item.tag) || string(item.type) || t("修改建议")}
          </strong>
          {!hideFixes && <span>{string(item.note)}</span>}
          {!hideFixes && item.replacement !== undefined && (
            <b>{string(item.replacement) || t("删掉")}</b>
          )}
        </span>
      </span>,
    );
    cursor = item.start + item.text.length;
  }
  parts.push(source.slice(cursor));
  return (
    <div className="writing rf-writing">
      {!!data.setting && (
        <p className="writing-setting">{string(data.setting)}</p>
      )}
      <div className="writing-marked">{parts}</div>
      <div className="writing-switches">
        <button
          aria-pressed={hideFixes}
          onClick={() => setHideFixes(!hideFixes)}
        >
          {hideFixes ? t("显示答案") : t("藏答案")}
        </button>
        <span className="grow" />
        <span className="error">{t("错误")}</span>
        <span className="awkward">{t("欠妥")}</span>
        <span className="good">{t("亮点")}</span>
      </div>
      {hideFixes && (
        <p className="microcopy">{t("先自己想想怎么改，再看答案。")}</p>
      )}
      {!hideFixes && (
        <>
          {!!ranges.length && (
            <details
              className="writing-analysis"
              open={showAnalysis}
              onToggle={(event) => setShowAnalysis(event.currentTarget.open)}
            >
              <summary>
                {t("修改分析")} <small>{ranges.length}</small>
              </summary>
              <ol>
                {ranges.map((item, index) => (
                  <li key={item.start + "-" + index}>
                    <div>
                      <strong>{item.text}</strong>
                      {item.replacement !== undefined &&
                        item.replacement !== item.text && (
                          <>
                            {" "}
                            → <b>{item.replacement || t("删掉")}</b>
                          </>
                        )}
                    </div>
                    {(item.tag || item.type) && (
                      <small>{item.tag || item.type}</small>
                    )}
                    {item.note && <p>{item.note}</p>}
                  </li>
                ))}
              </ol>
            </details>
          )}
          <button
            className="writing-show"
            aria-expanded={showImproved}
            onClick={() => setShowImproved(!showImproved)}
          >
            {showImproved ? t("改后") : t("显示改后版本")}
          </button>
          {showImproved && <p className="revision">{revision || "…"}</p>}
          {summary && <p className="writing-summary">{summary}</p>}
          {revision && (
            <details
              open={showDiff}
              onToggle={(e) => setShowDiff(e.currentTarget.open)}
            >
              <summary>{t("查看修改对比")}</summary>
              <div className="diff">
                {showDiff &&
                  diffWordsWithSpace(source, revision).map((part, index) =>
                    part.added ? (
                      <ins key={index}>{part.value}</ins>
                    ) : part.removed ? (
                      <del key={index}>{part.value}</del>
                    ) : (
                      <span key={index}>{part.value}</span>
                    ),
                  )}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
