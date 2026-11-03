import {
  defaultLayout,
  fieldExpression,
  type OutputField,
  type OutputSample,
} from "./action-output";
import { t } from "./i18n";

export const templateIds = [
  "dictionary",
  "sentence",
  "polish",
  "blank",
] as const;
export type TemplateId = (typeof templateIds)[number];
export const templateInfo = {
  dictionary: {
    name: "词典",
    icon: "book",
    description: "查词义、音标和用法，把语境中的词汇收入生词本。",
  },
  sentence: {
    name: "长难句分析",
    icon: "scan",
    description: "标出句子成分和从句，结合译文理解原句。",
  },
  polish: {
    name: "写作改进",
    icon: "pen",
    description: "逐处查看修改建议，对照原文和改后版本。",
  },
  blank: {
    name: "空白",
    icon: "sparkles",
    description: "从一个结果字段开始，自行定义提示词和版式。",
  },
} as const;
type Spec = [
  id: string,
  name: string,
  description: string,
  sample: string,
  selection?: true,
];
const selection =
  "Small observations, carefully recorded, can lead to unexpected discoveries.";
const specs: Record<TemplateId, Spec[]> = {
  dictionary: [
    ["dictionary-term", "词条", "选中词语在此语境中的基本形式。", "blossom"],
    ["dictionary-phonetic", "音标", "使用该语言的常用音标。", "/ˈblɒs.əm/"],
    [
      "dictionary-part-of-speech",
      "词性",
      "语境中的词性，例如 noun 或 verb。",
      "noun",
    ],
    [
      "dictionary-definition",
      "释义",
      "用 {{targetLanguage}} 简明解释语境中的含义。",
      "花；花朵（尤指果树的花）",
    ],
    [
      "dictionary-context",
      "句子",
      "从补充的上下文摘录含有该词的完整句；没有时给出一个简短例句。",
      "The ephemeral beauty of cherry blossoms reminds us to cherish each moment.",
    ],
    [
      "dictionary-context-term",
      "句中词形",
      "句中出现的原文片段，编码成 JSON 数组字符串，每项包含 text。",
      '[{"text":"blossoms"}]',
    ],
    [
      "dictionary-context-translation",
      "句子翻译",
      "用 {{targetLanguage}} 翻译这个句子。",
      "樱花短暂的美丽提醒我们珍惜每一刻。",
    ],
    [
      "dictionary-memory-tips",
      "记忆技巧",
      "最多三条真正有帮助的记忆方法，每条单独一行。",
      "词源：和 bloom（开花）同源，bl- 开头的 bloom、blossom 都和开花有关。\n近义词：bloom 多指花开的状态，blossom 常指果树（樱桃、苹果）的花。",
    ],
    ["dictionary-difficulty", "难度", "CEFR 难度等级，未知时为 null。", "B2"],
  ],
  sentence: [
    ["sentence-analysis-sentence", "原句", "", selection, true],
    [
      "sentence-analysis-annotations",
      "标注",
      "Return a JSON string containing an array of literal spans. Each has text, type (subject, predicate, object, complement, attributive, adverbial, appositive or connector), and a brief note in {{targetLanguage}}. Mark subordinate clauses with form: clause. Include their inner roles and the full main predicate. Optional head names the modified word, obstacle a difficulty, restore its plain form, and occurrence the 1-based match for repeated text.",
      '[{"text":"Small observations","role":"主语","note":"句子的核心主语。"},{"text":"carefully recorded","role":"定语","note":"过去分词短语修饰 observations。"},{"text":"can lead to","role":"谓语","note":"表达可能的结果。"}]',
    ],
    [
      "sentence-analysis-translation",
      "译文",
      "自然流畅地译成 {{targetLanguage}}。",
      "仔细记录的细微观察，有时会带来意想不到的发现。",
    ],
  ],
  polish: [
    [
      "improve-writing-original",
      "原文",
      "",
      "She go to the library every week.",
      true,
    ],
    [
      "improve-writing-setting",
      "场合",
      "用 {{targetLanguage}} 简述语体和可能的写作场合。",
      "日常叙述 · 中性语体",
    ],
    [
      "improve-writing-annotations",
      "标注",
      "Encode an array of {text, replacement, note, type, tier} as a JSON string. Quote exact spans in order; tier is error, awkward or good. Write notes in {{targetLanguage}}.",
      '[{"text":"go","replacement":"goes","note":"第三人称单数主语对应 goes。","type":"语法","tier":"error"}]',
    ],
    [
      "improve-writing-improved",
      "改后",
      "保留原意和原文语言，给出完整的改后文本。",
      "She goes to the library every week.",
    ],
    [
      "improve-writing-summary",
      "总评",
      "用 {{targetLanguage}} 总结最值得留意的一处变化。",
      "主语和动词现在在人称与数上一致。",
    ],
  ],
  blank: [
    [
      "result",
      "结果",
      "按照提示词回答，用 {{targetLanguage}} 表达。",
      "一次偶然的发现，往往始于细致的观察。",
    ],
  ],
};
const systems: Record<TemplateId, string> = {
  dictionary:
    "你是词典编写者。根据选区和段落确定词义，给出基本词形、读音、词性与简明释义。例句优先引用提供的原文，标出词条在句中的实际形式。用 {{targetLanguage}} 解释词义和记忆方法。未知信息留空。",
  sentence:
    "Analyze the selected sentence. Identify the main clause, modifiers and subordinate clauses. Anchor each annotation to a literal span. Explain their relationship and translate the sentence into {{targetLanguage}}.",
  polish:
    "Improve grammar and natural phrasing while preserving meaning, register, proper names and the original language. Annotate only meaningful edits and strengths. Explain them in {{targetLanguage}}.",
  blank: "",
};
export function builtinId(id: string): id is Exclude<TemplateId, "blank"> {
  return id === "dictionary" || id === "sentence" || id === "polish";
}
export function presetLayout(kind: TemplateId, fields: OutputField[]) {
  if (kind === "blank") return defaultLayout;
  const match = specs[kind].map(([id]) => fields.find((f) => f.id === id));
  if (match.some((f) => !f)) return undefined;
  const value = (i: number) => "{{ " + fieldExpression(match[i]!.name) + " }}";
  const yes = (i: number) =>
    "{% if " +
    fieldExpression(match[i]!.name) +
    " != nil and " +
    fieldExpression(match[i]!.name) +
    ' != "" %}';
  if (kind === "dictionary")
    return `<article class="dictionary dictionary-v2">
  <header class="dictionary-heading"><div class="dictionary-word"><h2>${value(0)}</h2><button class="card-speak" data-speak="${value(0)}" aria-label="${t("朗读")}"></button>${yes(8)}<em>${value(8)}</em>{% endif %}</div><div class="dictionary-pronunciation"><span>${value(1)}</span> <i>${value(2)}</i></div></header>
  ${yes(3)}<p class="definition">${value(3)}</p>{% endif %}
  ${yes(4)}<blockquote><span data-marks="${value(5)}">${value(4)}</span><button class="card-speak" data-speak="${value(4)}" aria-label="${t("朗读例句")}"></button>${yes(6)}<small>${value(6)}</small>{% endif %}</blockquote>{% endif %}
  ${yes(7)}<aside class="memory-tips"><span class="memory-icon"></span><p>${value(7)}</p></aside>{% endif %}
</article>`;
  if (kind === "sentence")
    return `<article class="sentence-card">
  <div data-sentence data-original="${value(0)}" data-marks="${value(1)}"></div>
  ${yes(2)}<blockquote>${value(2)}</blockquote>{% endif %}
</article>`;
  return `<article data-writing data-original="${value(0)}" data-setting="${value(1)}"
  data-marks="${value(2)}" data-revision="${value(3)}" data-summary="${value(4)}"></article>`;
}

/** v0.10 built-in markup, retained only to recognize untouched settings during upgrade. */
export function legacyDictionaryLayout(fields: OutputField[]) {
  const match = specs.dictionary.map(([id]) => fields.find((f) => f.id === id));
  if (match.some((f) => !f)) return undefined;
  const value = (i: number) => "{{ " + fieldExpression(match[i]!.name) + " }}";
  const yes = (i: number) =>
    "{% if " +
    fieldExpression(match[i]!.name) +
    " != nil and " +
    fieldExpression(match[i]!.name) +
    ' != "" %}';
  return `<article class="dictionary">
  <header><h2>${value(0)}</h2><button data-speak="${value(0)}" aria-label="${t("朗读")}">♪</button>${yes(8)}<em>${value(8)}</em>{% endif %}</header>
  <small>${value(1)}　${value(2)}</small>
  <p class="definition">${value(3)}</p>
  ${yes(4)}<blockquote><span data-marks="${value(5)}">${value(4)}</span><button data-speak="${value(4)}" aria-label="${t("朗读例句")}">♪</button><small>${value(6)}</small></blockquote>{% endif %}
  ${yes(7)}<details><summary>${t("记忆技巧")}</summary><p>${value(7)}</p></details>{% endif %}
</article>`;
}

export function definition(kind: TemplateId) {
  const outputSchema: OutputField[] = specs[kind].map(
    ([id, name, description, , isSelection]) => ({
      id,
      name: t(name),
      description: t(description),
      type: "string",
      source: isSelection ? "selection" : "model",
    }),
  );
  const sample: OutputSample = {
    selection:
      specs[kind].find((s) => s[4])?.[3] ??
      (kind === "dictionary" ? "blossom" : selection),
    targetLanguage: t("简体中文"),
    values: Object.fromEntries(
      specs[kind].filter((s) => !s[4]).map(([id, , , value]) => [id, value]),
    ),
  };
  return {
    outputSchema,
    layout: presetLayout(kind, outputSchema)!,
    sample,
    system: t(systems[kind]),
    prompt: t(
      "选中文本：{{selection}}\n补充段落：{{paragraphs}}\n目标语言：{{targetLanguage}}",
    ),
    icon: templateInfo[kind].icon,
    format:
      kind === "dictionary"
        ? ("dictionary" as const)
        : kind === "polish"
          ? ("writing" as const)
          : ("markdown" as const),
  };
}
