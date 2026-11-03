// Reads data literals from a pinned public Read Frog commit; never executes its code.
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import ts from "typescript";
const reference = process.argv[2] ?? ".reference/read-frog";
const revision = process.argv[3] ?? "96083134b111e56762f578b143bcd48e85058ba3";
const commit = execFileSync(
  "git",
  ["-C", reference, "rev-parse", revision + "^{commit}"],
  { encoding: "utf8" },
).trim();
function literal(node) {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node))
    return literal(node.expression);
  if (ts.isStringLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node))
    return Object.fromEntries(
      node.properties.map((p) => {
        if (
          !ts.isPropertyAssignment(p) ||
          !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
        )
          throw Error("Unexpected catalog property");
        return [p.name.text, literal(p.initializer)];
      }),
    );
  throw Error("Expected a data literal, got " + ts.SyntaxKind[node.kind]);
}
function readConstant(file, name) {
  const source = execFileSync(
    "git",
    ["-C", reference, "show", commit + ":" + file],
    { encoding: "utf8" },
  );
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  for (const s of ast.statements)
    if (ts.isVariableStatement(s))
      for (const d of s.declarationList.declarations)
        if (d.name.getText(ast) === name) return literal(d.initializer);
  throw Error("Missing upstream constant: " + name);
}
const modelPath = "src/utils/constants/models.ts",
  defaultPath = "src/utils/constants/providers.ts";
const models = readConstant(modelPath, "LLM_PROVIDER_MODELS");
const defaults = readConstant(defaultPath, "DEFAULT_LLM_PROVIDER_MODELS");
const aliases = {
  openai: "openai",
  deepseek: "deepseek",
  qwen: "alibaba",
  siliconflow: "siliconflow",
  gemini: "google",
  openrouter: "openrouter",
};
const providers = Object.fromEntries(
  Object.entries(aliases).map(([id, upstream]) => {
    const ids = models[upstream],
      model = defaults[upstream];
    if (
      !ids.length ||
      new Set(ids).size !== ids.length ||
      !ids.includes(model.model)
    )
      throw Error("Invalid upstream catalog: " + upstream);
    return [
      id,
      {
        upstream,
        defaultModel: model.model,
        customModel: model.isCustomModel,
        models: ids,
      },
    ];
  }),
);
await writeFile(
  "src/shared/provider-catalog.json",
  JSON.stringify(
    {
      source: "https://github.com/mengxi-ream/read-frog",
      commit,
      files: [modelPath, defaultPath],
      providers,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  Object.fromEntries(
    Object.entries(providers).map(([id, p]) => [
      id,
      { defaultModel: p.defaultModel, models: p.models.length },
    ]),
  ),
);
