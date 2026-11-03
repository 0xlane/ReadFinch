import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ThinkingSnapshot } from "../shared/completion";
import { t } from "../shared/i18n";
import "./thinking.css";

// Glyph geometry adapted from Read Frog (GPL-3.0); see THIRD_PARTY_NOTICES.md.
const circle =
  "M 12 8 C 14.21 8 16 9.79 16 12 C 16 14.21 14.21 16 12 16 C 9.79 16 8 14.21 8 12 C 8 9.79 9.79 8 12 8 Z";
const loop =
  "M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z";
const reverseCircle =
  "M 12 16 C 14.21 16 16 14.21 16 12 C 16 9.79 14.21 8 12 8 C 9.79 8 8 9.79 8 12 C 8 14.21 9.79 16 12 16 Z";
const pathValue = (d: string) => `path("${d}")`;

function ThinkingIcon({ animated }: { animated: boolean }) {
  const path = useRef<SVGPathElement>(null);
  useEffect(() => {
    const node = path.current!;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    const update = () => {
      const from = getComputedStyle(node).d;
      animation?.cancel();
      animation = undefined;
      node.style.d = pathValue(circle);
      if (preference.matches) return;
      animation = animated
        ? node.animate(
            [circle, loop, reverseCircle, loop, circle].map((d) => ({
              d: pathValue(d),
              easing: "ease-in-out",
            })),
            { duration: 6000, iterations: Infinity },
          )
        : node.animate([{ d: from }, { d: pathValue(circle) }], {
            duration: 400,
            easing: "ease-in-out",
          });
    };
    update();
    preference.addEventListener("change", update);
    return () => {
      // Preserve the current shape so the next state can settle smoothly.
      node.style.d = getComputedStyle(node).d;
      animation?.cancel();
      preference.removeEventListener("change", update);
    };
  }, [animated]);
  return (
    <svg
      className="thinking-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path ref={path} d={circle} />
    </svg>
  );
}

export function Thinking({ value }: { value: ThinkingSnapshot }) {
  const [open, setOpen] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);
  const contentId = useId();
  const text = value.text.trim();
  const active = value.status === "thinking";
  useEffect(() => {
    if (open) autoScroll.current = true;
  }, [open]);
  useEffect(() => {
    if (!open || !autoScroll.current) return;
    const frame = requestAnimationFrame(() => {
      if (content.current)
        content.current.scrollTop = content.current.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, text]);
  const label = (
    <span className="thinking-heading">
      <ThinkingIcon animated={active} />
      <span className="thinking-label" role="status">
        {active ? t("思考中") : t("思考完成")}
      </span>
    </span>
  );
  return (
    <div className={"thinking-card" + (active ? " is-thinking" : "")}>
      {text ? (
        <button
          className="thinking-trigger"
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={open ? t("收起思考") : t("展开思考")}
          onClick={() => setOpen(!open)}
        >
          {label}
          <ChevronDown size={14} className={open ? "is-open" : ""} />
        </button>
      ) : (
        <div className="thinking-trigger">{label}</div>
      )}
      {text && (
        <div
          className="thinking-reveal"
          data-open={open}
          aria-hidden={!open}
          inert={!open}
          id={contentId}
        >
          <div className="thinking-clip">
            <div
              className="thinking-content"
              ref={content}
              onScroll={() => {
                const node = content.current!;
                if (node.scrollHeight - node.scrollTop - node.clientHeight > 8)
                  autoScroll.current = false;
              }}
            >
              <p>{text}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
