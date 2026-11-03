import { t } from "../shared/i18n";
import { useEffect, useState, useRef } from "react";
import { ocrProfiles } from "../shared/config";
import { ScanLine } from "lucide-react";
import type { Capture as ImageCapture } from "../shared/api";
export function CaptureOverlay() {
  const [image, setImage] = useState<ImageCapture | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const [error, setError] = useState("");
  const [hint, setHint] = useState(t("拖动框选无法选择的文字"));
  const submitting = useRef(false);
  const imageReady = useRef(false);
  useEffect(() => {
    void window.readfinch.call("captureData").then(setImage);
    void window.readfinch.call("snapshot").then(({ config }) => {
      const profile = ocrProfiles(config).find(
        (item) => item.id === config.defaults.ocrProfileId,
      );
      setHint(
        profile?.kind === "openai"
          ? t("框选文字，松开后预览并选择识别")
          : t("框选文字，松开后自动识别"),
      );
    });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape")
        void window.readfinch.call("window", { command: "dismiss" });
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  const rect =
    start && end
      ? {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          width: Math.abs(start.x - end.x),
          height: Math.abs(start.y - end.y),
        }
      : null;
  const physicalSize =
    rect && image
      ? {
          width: Math.round((rect.width * image.width) / innerWidth),
          height: Math.round((rect.height * image.height) / innerHeight),
        }
      : null;
  return (
    <div
      className="capture-overlay"
      data-selecting={!!rect && rect.width > 0 && rect.height > 0}
      onPointerDown={(e) => {
        if (
          submitting.current ||
          !imageReady.current ||
          !image ||
          e.button !== 0
        )
          return;
        setError("");
        e.currentTarget.setPointerCapture(e.pointerId);
        setStart({ x: e.clientX, y: e.clientY });
        setEnd({ x: e.clientX, y: e.clientY });
      }}
      onPointerMove={(e) => {
        if (start)
          setEnd({
            x: Math.max(0, Math.min(innerWidth, e.clientX)),
            y: Math.max(0, Math.min(innerHeight, e.clientY)),
          });
      }}
      onPointerUp={(event) => {
        if (!start || event.button !== 0) return;
        const point = {
          x: Math.max(0, Math.min(innerWidth, event.clientX)),
          y: Math.max(0, Math.min(innerHeight, event.clientY)),
        };
        const crop = {
          x: Math.min(start.x, point.x),
          y: Math.min(start.y, point.y),
          width: Math.abs(start.x - point.x),
          height: Math.abs(start.y - point.y),
        };
        if (crop.width > 3 && crop.height > 3 && !submitting.current) {
          submitting.current = true;
          void window.readfinch
            .call("crop", {
              ...crop,
              viewportWidth: innerWidth,
              viewportHeight: innerHeight,
            })
            .catch((e) => {
              setError(e.message);
              submitting.current = false;
              setStart(null);
              setEnd(null);
            });
        } else {
          setStart(null);
          setEnd(null);
        }
      }}
      onPointerCancel={() => {
        setStart(null);
        setEnd(null);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        void window.readfinch.call("window", { command: "dismiss" });
      }}
    >
      {image && (
        <img
          src={image.dataUrl}
          alt=""
          draggable={false}
          onLoad={() => {
            imageReady.current = true;
            requestAnimationFrame(
              () => void window.readfinch.call("captureReady"),
            );
          }}
          onError={() =>
            void window.readfinch.call("window", { command: "dismiss" })
          }
        />
      )}
      {(!rect || rect.width === 0 || rect.height === 0) && (
        <div className="capture-shade" />
      )}
      {rect && rect.width > 0 && rect.height > 0 && (
        <div
          className="crop-selection"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
          }}
        >
          <span
            style={{
              ...(rect.y + rect.height + 28 > innerHeight
                ? { bottom: "auto", top: -28 }
                : {}),
              left: Math.max(-rect.x, Math.min(0, innerWidth - rect.x - 140)),
            }}
          >
            {physicalSize?.width} × {physicalSize?.height}
          </span>
        </div>
      )}
      <div className="capture-hint">
        <ScanLine size={18} />
        {error || hint}
        <kbd>{t("Esc / 右键取消")}</kbd>
      </div>
    </div>
  );
}
