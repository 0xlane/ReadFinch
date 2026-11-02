// JSON object key order can change during schema validation. Array order is meaningful.
export function sameDraft(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.hasOwn(b, key) &&
        sameDraft(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
        ),
    )
  );
}

// Rebase clean fields after an async save without discarding newer typing.
// Arrays are atomic (profiles and actions have their own stable identities).
export function rebaseDraft<T>(draft: T, before: T, incoming: T): T {
  if (sameDraft(draft, before)) return incoming;
  if (
    draft &&
    before &&
    incoming &&
    typeof draft === "object" &&
    typeof before === "object" &&
    typeof incoming === "object" &&
    !Array.isArray(draft)
  ) {
    // A change of detector mode replaces its whole binding. A late save must
    // not put an old LLM provider and model back into a basic detector.
    if (
      "mode" in draft &&
      "mode" in before &&
      "mode" in incoming &&
      (draft.mode !== before.mode || incoming.mode !== before.mode)
    )
      return draft;
    const result = { ...draft };
    for (const key of Object.keys(incoming) as (keyof T)[])
      result[key] = rebaseDraft(draft[key], before[key], incoming[key]);
    return result;
  }
  return draft;
}
