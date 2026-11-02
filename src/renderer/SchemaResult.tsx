import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderCard } from "./action-layout";
import {
  parseOutput,
  streamingValues,
  type OutputView,
} from "../shared/action-output";
import { WritingResult } from "./WritingResult";
import { speakText, stopSpeaking } from "./speech";
import { SentenceResult } from "./SentenceResult";
import { annotationSegments, locateAnnotations } from "../shared/annotations";
import cardStyles from "./action-card.css?inline";

function MarkedText({ text, marks }: { text: string; marks: string }) {
  const ranges = locateAnnotations(text, marks);
  return (
    <>
      {annotationSegments(text, ranges).map((p) =>
        p.index < 0 ? p.text : <mark key={p.start}>{p.text}</mark>,
      )}
    </>
  );
}
type Slot = { node: HTMLElement; props: DOMStringMap; original: string };
const slotKind = (props: DOMStringMap) =>
  props.writing !== undefined
    ? "writing"
    : props.sentence !== undefined
      ? "sentence"
      : "marks";
// Match disclosures by their labels so a conditional section arriving earlier cannot inherit another section's state.
function disclosures(parent: ParentNode) {
  const counts = new Map<string, number>();
  const found = new Map<string, HTMLDetailsElement>();
  for (const detail of parent.querySelectorAll("details")) {
    if (detail.closest("[data-writing], [data-sentence], [data-marks]"))
      continue;
    const label =
      detail.querySelector(":scope > summary")?.textContent?.trim() ?? "";
    const ordinal = counts.get(label) ?? 0;
    counts.set(label, ordinal + 1);
    found.set(JSON.stringify([label, ordinal]), detail);
  }
  return found;
}

export function SchemaResult({
  view,
  text,
  source,
  targetLanguage,
  finished,
  status,
  theme,
  autoplay = false,
}: {
  view: OutputView;
  text: string;
  source: string;
  targetLanguage: string;
  finished: boolean;
  status?: string;
  theme?: "light" | "dark";
  autoplay?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    played = useRef(false),
    speaking = useRef("");
  const previousScope = useRef<{ source: string; layout?: string } | null>(
    null,
  );
  const previousSlots = useRef<Slot[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]),
    [warning, setWarning] = useState("");
  const fields = view.outputSchema,
    layout = view.layout;
  useLayoutEffect(() => {
    const container = host.current!,
      root = container.shadowRoot ?? container.attachShadow({ mode: "open" });
    let values = streamingValues(text);
    try {
      if (finished) values = parseOutput(text, fields);
    } catch {
      /* The job owns protocol diagnostics; keep the partial card. */
    }
    const state = status ?? (finished ? "done" : "streaming");
    const { body, css, warning } = renderCard(
      { outputSchema: fields, layout },
      values,
      source,
      targetLanguage,
      state,
    );
    const wrap = document.createElement("div");
    wrap.className = "action-card";
    wrap.dataset.status = state;
    wrap.dataset.theme = theme ?? document.documentElement.dataset.theme;
    const style = document.createElement("style");
    style.textContent = cardStyles + "\n" + css;
    wrap.append(body);
    const scope = previousScope.current;
    if (scope && scope.source === source && scope.layout === layout) {
      const previous = disclosures(root);
      for (const [key, detail] of disclosures(wrap)) {
        const old = previous.get(key);
        if (old) detail.open = old.open;
      }
    } else {
      previousSlots.current = [];
    }
    previousScope.current = { source, layout };
    const focused = root.activeElement;
    root.replaceChildren(style, wrap);
    setWarning(warning);
    const nextSlots = [
      ...wrap.querySelectorAll<HTMLElement>(
        "[data-writing], [data-sentence], [data-marks]",
      ),
    ]
      .slice(0, 64)
      .map((node, index) => {
        const original = node.dataset.original ?? node.textContent ?? "";
        const old = previousSlots.current[index];
        const mount =
          old &&
          old.original === original &&
          slotKind(old.props) === slotKind(node.dataset)
            ? old.node
            : document.createElement(node.tagName === "SPAN" ? "span" : "div");
        node.replaceChildren(mount);
        return { node: mount, props: node.dataset, original };
      });
    previousSlots.current = nextSlots;
    if (focused instanceof HTMLElement && root.contains(focused))
      focused.focus({ preventScroll: true });
    setSlots(nextSlots);
    const voice = (el: HTMLElement) => {
      const words = el.dataset.speak || el.textContent || "";
      if (words.trim()) {
        speaking.current = words;
        void speakText(words, el.dataset.speakLang);
      }
    };
    const click = (e: Event) => {
      const target =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>("[data-speak]")
          : null;
      if (target && state === "done") voice(target);
    };
    root.addEventListener("click", click);
    wrap.querySelectorAll<HTMLElement>("[data-speak]").forEach((el) => {
      if (el instanceof HTMLButtonElement) el.disabled = state !== "done";
    });
    if (state === "streaming") played.current = false;
    if (autoplay && !played.current && state === "done") {
      const first = wrap.querySelector<HTMLElement>("[data-speak-autoplay]");
      if (first) {
        played.current = true;
        voice(first);
      }
    }
    return () => root.removeEventListener("click", click);
  }, [
    fields,
    layout,
    text,
    source,
    targetLanguage,
    finished,
    status,
    theme,
    autoplay,
  ]);
  useLayoutEffect(() => {
    if (theme) return;
    const observer = new MutationObserver(() => {
      const card =
        host.current?.shadowRoot?.querySelector<HTMLElement>(".action-card");
      if (card) card.dataset.theme = document.documentElement.dataset.theme;
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [theme]);
  useLayoutEffect(
    () => () => {
      if (speaking.current) stopSpeaking(speaking.current);
    },
    [],
  );
  return (
    <>
      <div className="schema-result" data-theme={theme} ref={host} />
      {slots.map(({ node, props, original }, i) =>
        createPortal(
          props.writing !== undefined ? (
            <WritingResult
              source={original}
              data={{
                setting: props.setting,
                revision: props.revision,
                annotations: props.marks,
                explanation: props.summary,
              }}
            />
          ) : props.sentence !== undefined ? (
            <SentenceResult source={original} marks={props.marks ?? ""} />
          ) : (
            <MarkedText text={original} marks={props.marks ?? ""} />
          ),
          node,
          String(i),
        ),
      )}
      {warning && (
        <small className="layout-warning" role="status">
          {warning}
        </small>
      )}
    </>
  );
}
