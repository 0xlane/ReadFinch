import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { diffWordsWithSpace } from "diff";
import { locateAnnotations } from "../shared/annotations";
import { t } from "../shared/i18n";
const string = (value: unknown) => (typeof value === "string" ? value : "");
export function WritingResult({
  data,
  source,
  pending = false,
}: {
  data: Record<string, unknown>;
  source: string;
  pending?: boolean;
}) {
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [showDiff, setShowDiff] = useState(false);
  const [hideFixes, setHideFixes] = useState(false);
  const [showImproved, setShowImproved] = useState(true);
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState(false);
  const revision = string(data.revision || data.improved);
  const revisedParts = useMemo(
    () =>
      diffWordsWithSpace(source, revision, {
        timeout: 25,
        maxEditLength: 1000,
      }) ?? [{ value: revision, added: false, removed: false }],
    [source, revision],
  );
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
  const waiting = (
    <div className="writing-pending" role="status" aria-label={t("正在生成")} />
  );
  if (pending && !data.setting && !data.annotations && !revision && !summary)
    return waiting;
  return (
    <div className="writing rf-writing">
      <div className="writing-marked">{parts}</div>
      {(!!data.setting || summary) && (
        <p className="writing-context">
          {!!data.setting && (
            <span className="writing-setting">{string(data.setting)}</span>
          )}
          {summary && <span className="writing-summary">{summary}</span>}
        </p>
      )}
      <div className="writing-switches">
        <button
          aria-pressed={hideFixes}
          onClick={() => setHideFixes(!hideFixes)}
        >
          {hideFixes ? t("显示答案") : t("藏答案")}
        </button>
        <span className="grow" />
        {(["error", "awkward", "good"] as const).map((tier, index) => {
          const count = ranges.filter(
            (item) => (item.tier || "awkward") === tier,
          ).length;
          return count ? (
            <span className={tier} key={tier}>
              {t(["错误", "欠妥", "亮点"][index])} {count}
            </span>
          ) : null;
        })}
      </div>
      {hideFixes && (
        <p className="microcopy">{t("先自己想想怎么改，再看答案。")}</p>
      )}
      {!hideFixes && (
        <>
          {revision ? (
            <section className="writing-revision">
              <header>
                <button
                  className="writing-show"
                  aria-expanded={showImproved}
                  onClick={() => setShowImproved(!showImproved)}
                >
                  {showImproved ? t("改后") : t("显示改后版本")}
                </button>
                <button
                  aria-label={copied === revision ? t("已复制") : t("复制结果")}
                  disabled={pending}
                  onClick={async () => {
                    try {
                      await window.readfinch.call("clipboardWrite", {
                        text: revision,
                      });
                      setCopied(revision);
                      setCopyError(false);
                    } catch {
                      setCopyError(true);
                    }
                  }}
                >
                  {copied === revision ? (
                    <Check size={14} />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </header>
              {showImproved && (
                <p className="revision">
                  {revisedParts.map((part, index) =>
                    part.removed ? null : part.added ? (
                      <mark key={index}>{part.value}</mark>
                    ) : (
                      <span key={index}>{part.value}</span>
                    ),
                  )}
                </p>
              )}
              {copyError && (
                <small role="status">{t("复制失败，请重试")}</small>
              )}
            </section>
          ) : pending ? (
            waiting
          ) : null}
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
          {revision && (
            <details
              open={showDiff}
              onToggle={(e) => setShowDiff(e.currentTarget.open)}
            >
              <summary>{t("查看修改对比")}</summary>
              <div className="diff">
                {showDiff &&
                  revisedParts.map((part, index) =>
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
