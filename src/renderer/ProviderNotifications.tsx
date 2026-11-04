import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { OctagonAlert, X } from "lucide-react";
import { t } from "../shared/i18n";

const Viewport = createContext<HTMLDivElement | null>(null);

export function ProviderNotifications({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  return (
    <Viewport.Provider value={viewport}>
      {children}
      {createPortal(
        <div className="provider-notifications" ref={setViewport} />,
        document.body,
      )}
    </Viewport.Provider>
  );
}

export function ProviderErrorNotice({
  title,
  message,
  onClose,
  trigger,
}: {
  title: string;
  message: string;
  onClose: () => void;
  trigger: React.RefObject<HTMLButtonElement | null>;
}) {
  const viewport = useContext(Viewport);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const dismiss = useRef(onClose);
  dismiss.current = onClose;
  useEffect(() => {
    if (!viewport || hovered || focused) return;
    const timer = setTimeout(() => dismiss.current(), 5000);
    return () => clearTimeout(timer);
  }, [viewport, hovered, focused, message]);
  return (
    viewport &&
    createPortal(
      <div
        className="provider-error-notice"
        role="alert"
        aria-label={title}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <OctagonAlert size={17} aria-hidden="true" />
        <div>
          <strong>{title}</strong>
          <p>{message}</p>
        </div>
        <button
          type="button"
          aria-label={t("关闭通知")}
          onClick={(event) => {
            onClose();
            if (event.detail === 0)
              trigger.current?.focus({ preventScroll: true });
          }}
        >
          <X size={15} />
        </button>
      </div>,
      viewport,
    )
  );
}
