import type { CompletionUpdate, ThinkingSnapshot } from "../shared/completion";
import { ProviderError } from "./provider-http";
import { t } from "../shared/i18n";

export class CompletionProgress {
  text = "";
  private thinking: ThinkingSnapshot = { status: "thinking", text: "" };

  constructor(private readonly update: CompletionUpdate) {}

  private emit() {
    if (this.text.length + this.thinking.text.length > 1_000_000)
      throw new ProviderError("limit", t("结果过长，已停止接收"));
    this.update(this.text, { ...this.thinking });
  }

  appendText(delta: string) {
    if (!delta) return;
    this.text += delta;
    this.thinking.status = "complete";
    this.emit();
  }

  appendReasoning(delta: string) {
    if (!delta) return;
    this.thinking = { status: "thinking", text: this.thinking.text + delta };
    this.emit();
  }

  startThinking() {
    this.thinking.status = "thinking";
    this.emit();
  }

  endThinking() {
    if (this.thinking.status === "complete") return;
    this.thinking.status = "complete";
    this.emit();
  }
}

// Compatible APIs expose readable reasoning under different names. Never display
// encrypted blocks, signatures, or unrelated provider metadata as reasoning.
export function chatReasoning(value: Record<string, any> | undefined): string {
  if (!value) return "";
  if (typeof value.reasoning_content === "string" && value.reasoning_content)
    return value.reasoning_content;
  if (typeof value.reasoning === "string" && value.reasoning)
    return value.reasoning;
  if (!Array.isArray(value.reasoning_details)) return "";
  return value.reasoning_details
    .map((part: any) =>
      part?.type === "reasoning.text" && typeof part.text === "string"
        ? part.text
        : part?.type === "reasoning.summary" && typeof part.summary === "string"
          ? part.summary
          : "",
    )
    .join("");
}
