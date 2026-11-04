import { useEffect, useRef, useState } from "react";
import { Check, Hourglass } from "lucide-react";
import { ProviderErrorNotice } from "./ProviderNotifications";
import { t } from "../shared/i18n";
type Feedback = "success" | "slow";

export function ConnectionTestButton({
  identity,
  disabled,
  run,
}: {
  identity: string;
  disabled: boolean;
  run: () => Promise<{ durationMs: number }>;
}) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const epoch = useRef(0),
    current = useRef(identity);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  current.current = identity;
  useEffect(() => {
    epoch.current++;
    clearTimeout(timer.current);
    setPending(false);
    setFeedback(null);
    setError("");
    return () => {
      epoch.current++;
      clearTimeout(timer.current);
    };
  }, [identity]);
  async function test() {
    const request = ++epoch.current,
      connection = identity;
    clearTimeout(timer.current);
    setFeedback(null);
    setError("");
    setPending(true);
    const valid = () =>
      request === epoch.current && connection === current.current;
    let next: Feedback = "success";
    try {
      const result = await run();
      if (!valid()) return;
      next = result.durationMs > 3000 ? "slow" : "success";
    } catch (failure) {
      if (!valid()) return;
      setError((failure as Error).message);
      setPending(false);
      return;
    }
    if (!valid()) return;
    setPending(false);
    setFeedback(next);
    timer.current = setTimeout(() => {
      if (valid()) setFeedback(null);
    }, 5000);
  }
  const label = pending
    ? t("测试中...")
    : feedback === "success"
      ? t("成功")
      : feedback === "slow"
        ? t("缓慢（建议调节思考模式）")
        : t("测试连接");
  const Icon = feedback === "slow" ? Hourglass : Check;
  return (
    <>
      <button
        type="button"
        className="provider-small-button connection-test"
        data-feedback={feedback ?? undefined}
        disabled={disabled || pending}
        aria-label={label}
        aria-busy={pending}
        ref={trigger}
        onClick={() => void test()}
      >
        {pending ? (
          <span className="connection-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        ) : (
          feedback && (
            <span
              className={"connection-feedback " + feedback}
              aria-hidden="true"
            >
              <Icon size={12} strokeWidth={2.5} />
            </span>
          )
        )}
        <span
          role="status"
          aria-live="polite"
          className={pending ? "connection-testing" : undefined}
        >
          {label}
        </span>
      </button>
      {error && (
        <ProviderErrorNotice
          title={t("连接失败")}
          message={error}
          onClose={() => setError("")}
          trigger={trigger}
        />
      )}
    </>
  );
}
