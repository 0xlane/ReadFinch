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
  useEffect(() => {
    void window.texthop.call("captureData").then(setImage);
    void window.texthop.call("snapshot").then(({ config }) => {
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
        void window.texthop.call("window", { command: "dismiss" });
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
  return (
    <div
      className="capture-overlay"
      onPointerDown={(e) => {
        if (submitting.current || !image || e.button !== 0) return;
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
          void window.texthop
            .call("crop", {
              ...crop,
              viewportWidth: innerWidth,
              viewportHeight: innerHeight,
            })
            .catch((e) => {
              setError(e.message);
              submitting.current = false;
            });
        }
      }}
      onPointerCancel={() => {
        setStart(null);
        setEnd(null);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        void window.texthop.call("window", { command: "dismiss" });
      }}
    >
      {image && <img src={image.dataUrl} draggable={false} />}
      <div className="capture-shade" />
      {rect && (
        <div
          className="crop-selection"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            backgroundImage: `url(${image?.dataUrl})`,
            backgroundSize: `${innerWidth}px ${innerHeight}px`,
            backgroundPosition: `-${rect.x}px -${rect.y}px`,
          }}
        >
          <span>
            {Math.round(rect.width)} × {Math.round(rect.height)}
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
