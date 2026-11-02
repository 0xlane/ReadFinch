export interface Annotation {
  text: string;
  role?: string;
  note?: string;
  tier?: string;
  type?: string;
  replacement?: string;
  tag?: string;
  form?: string;
  sense?: string;
  head?: string;
  obstacle?: string;
  restore?: string;
}

function readItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trimStart().startsWith("["))
    return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Model output is streamed. Consume complete flat annotation objects and
    // leave a partially received string or escape for the next chunk.
    const completed: unknown[] = [];
    const item = /\s*(?:\[|,)\s*(\{(?:[^{}"\\]|"(?:[^"\\]|\\.)*")*\})/gy;
    let match: RegExpExecArray | null;
    while (completed.length < 100 && (match = item.exec(value))) {
      try {
        completed.push(JSON.parse(match[1]));
      } catch {
        break;
      }
    }
    return completed;
  }
}

export function locateAnnotations(source: string, value: unknown) {
  const ranges: (Annotation & { start: number; end: number })[] = [];
  const nextOccurrence = new Map<string, number>();
  for (const entry of readItems(value).slice(0, 100)) {
    if (!entry || typeof entry !== "object" || !("text" in entry)) continue;
    const quote = entry.text;
    if (typeof quote !== "string" || !quote.trim()) continue;
    const occurrence = "occurrence" in entry ? entry.occurrence : undefined;
    let start = source.indexOf(quote, nextOccurrence.get(quote) ?? 0);
    if (
      typeof occurrence === "number" &&
      Number.isInteger(occurrence) &&
      occurrence > 0
    ) {
      start = source.indexOf(quote);
      for (let n = 1; start >= 0 && n < occurrence; n++)
        start = source.indexOf(quote, start + quote.length);
    } else if (start < 0 && nextOccurrence.has(quote)) {
      // Several roles can describe a single literal span.
      start = source.indexOf(quote);
    }
    if (start < 0) continue;
    const end = start + quote.length;
    const item: Annotation = { text: quote };
    for (const key of [
      "role",
      "note",
      "type",
      "tier",
      "replacement",
      "tag",
      "form",
      "sense",
      "head",
      "obstacle",
      "restore",
    ] as const) {
      const field = (entry as Record<string, unknown>)[key];
      if (typeof field === "string") item[key] = field;
    }
    if ("fix" in entry && typeof entry.fix === "string")
      item.replacement = entry.fix;
    if (!item.tier && item.type) {
      if (
        ["spelling", "grammar", "punctuation", "word-choice", "logic"].includes(
          item.type,
        )
      )
        item.tier = "error";
      if (["unnatural", "register", "clarity"].includes(item.type))
        item.tier = "awkward";
      if (item.type === "good") item.tier = "good";
    }
    ranges.push({ ...item, start, end });
    nextOccurrence.set(quote, end);
  }
  return ranges;
}

export function annotationSegments(
  source: string,
  ranges: ReturnType<typeof locateAnnotations>,
) {
  const boundaries = [
    ...new Set([0, source.length, ...ranges.flatMap((r) => [r.start, r.end])]),
  ].sort((a, b) => a - b);
  return boundaries.slice(1).map((end, i) => {
    const start = boundaries[i];
    let index = -1;
    for (const [j, r] of ranges.entries()) {
      if (
        r.start <= start &&
        end <= r.end &&
        (index < 0 || r.text.length < ranges[index].text.length)
      )
        index = j;
    }
    return { start, end, index, text: source.slice(start, end) };
  });
}
