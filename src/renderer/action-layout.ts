import { Liquid } from "liquidjs";
import DOMPurify from "dompurify";
import {
  defaultLayout,
  displayFields,
  type OutputView,
  type FieldValues,
} from "../shared/action-output";
import { t } from "../shared/i18n";

const engine = new Liquid({
  templates: {},
  ownPropertyOnly: true,
  strictFilters: true,
  outputEscape: "escape",
  parseLimit: 32768,
  renderLimit: 65,
  memoryLimit: 1_000_000,
});
const tags = new Set([
  "for",
  "if",
  "elsif",
  "else",
  "unless",
  "case",
  "assign",
  "break",
  "continue",
  "comment",
]);
for (const key of Object.keys(engine.tags))
  if (!tags.has(key)) delete engine.tags[key];
const filters = new Set([
  "default",
  "strip",
  "size",
  "upcase",
  "downcase",
  "capitalize",
  "truncate",
  "split",
  "join",
  "first",
  "last",
  "round",
  "plus",
  "minus",
  "times",
  "divided_by",
  "replace",
  "escape",
]);
for (const key of Object.keys(engine.filters))
  if (!filters.has(key)) delete engine.filters[key];
engine.registerFilter("lines", (v: unknown) => String(v ?? "").split(/\r?\n/));
engine.registerFilter("newline_to_br", {
  raw: true,
  handler: (v: unknown) =>
    String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")
      .replace(/\r?\n/g, "<br>"),
});

const allowedTags =
  "article section header footer main aside div span p small strong b i em u s mark sub sup h1 h2 h3 h4 h5 h6 ul ol li dl dt dd blockquote pre code hr br table thead tbody tr th td details summary button ruby rt rp".split(
    " ",
  );
export function unusedFields(
  source: string,
  fields: OutputView["outputSchema"],
) {
  try {
    const paths = engine.globalVariableSegmentsSync(source || defaultLayout);
    if (paths.some((p) => p[0] === "ctx" && p[1] === "fields")) return [];
    return fields.filter((f) => !paths.some((p) => p[0] === f.name));
  } catch {
    return [];
  }
}
const allowedAttributes =
  "class title aria-label open style data-speak data-speak-lang data-speak-autoplay data-marks data-writing data-sentence data-original data-setting data-revision data-summary".split(
    " ",
  );
const properties =
  /^(?:color|background-color|border(?:-(?:top|left|bottom|right|block|inline))?(?:-(?:color|style|width|radius))?|border-radius|padding(?:-[\w-]+)?|margin(?:-[\w-]+)?|font(?:-(?:size|weight|style|family))?|line-height|letter-spacing|text-(?:align|decoration|transform)|white-space|overflow-wrap|display|flex(?:-[\w-]+)?|align-items|justify-content|gap|grid-template-columns|max-width|width|opacity|list-style-type)$/;
function safeDeclarations(declaration: CSSStyleDeclaration) {
  const allowed = document.createElement("span").style;
  for (const name of declaration) {
    const value = declaration.getPropertyValue(name);
    if (
      properties.test(name) &&
      !/[\\@]|url\s*\(|image(?:-set)?\s*\(|attr\s*\(|(?:element|paint|cross-fade)\s*\(/i.test(
        value,
      )
    )
      allowed.setProperty(name, value);
  }
  return allowed.cssText;
}
function cleanStyles(raw: string) {
  if (/[\\@]/.test(raw)) return "";
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(raw);
  return [...sheet.cssRules]
    .flatMap((rule) => {
      if (
        !(rule instanceof CSSStyleRule) ||
        /::|:host-context|:has\(/i.test(rule.selectorText)
      )
        return [];
      const selector = rule.selectorText.replace(
        /:host(?:\(([^)]+)\))?/g,
        (_, s) => ".action-card" + (s ?? ""),
      );
      return selector + "{" + safeDeclarations(rule.style) + "}";
    })
    .join("\n");
}
export function renderCard(
  view: OutputView,
  values: FieldValues,
  selection: string,
  targetLanguage: string,
  status: string,
) {
  const fields = displayFields(view.outputSchema, values, selection);
  const context = {
    ...Object.fromEntries(fields.map((f) => [f.name, f.value])),
    ctx: { fields, selection, targetLanguage, status },
  };
  let css = "",
    warning = "";
  const source = (view.layout?.trim() || defaultLayout).replace(
    /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
    (_, s) => {
      css += cleanStyles(s);
      return "";
    },
  );
  let html: string;
  try {
    html = engine.parseAndRenderSync(source, context);
    if (html.length > 1_000_000) throw Error(t("版式输出过长"));
  } catch (e) {
    warning =
      t("版式无法显示，已使用字段列表。") +
      " " +
      String((e as Error).message)
        .split("\n")[0]
        .slice(0, 160);
    html = engine.parseAndRenderSync(defaultLayout, context);
    css = "";
  }
  const body = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttributes,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  const removed = DOMPurify.removed.some(
    (x) => !("element" in x) || x.element.nodeName !== "BODY",
  );
  for (const element of body.querySelectorAll<HTMLElement>("[style]"))
    element.style.cssText = safeDeclarations(element.style);
  return {
    body,
    css,
    warning: warning || (removed ? t("已移除版式中不支持的标签或属性。") : ""),
  };
}
