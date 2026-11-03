export type ThinkingSnapshot = {
  status: "thinking" | "complete";
  text: string;
};

// The answer and provider-reported reasoning travel separately, including on cache hits.
export type CompletionUpdate = (
  text: string,
  thinking?: ThinkingSnapshot,
) => void;
