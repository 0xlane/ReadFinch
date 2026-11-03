import { mkdir, readFile, writeFile, copyFile, access } from "node:fs/promises";
const version = "2.6.0";
const dest = new URL("../src/renderer/public/provider-icons/", import.meta.url);
const reference = new URL(
  "../.reference/read-frog/src/assets/providers/",
  import.meta.url,
);
const icons = {
  openai: "openai",
  deepseek: "deepseek-color",
  gemini: "gemini-color",
  anthropic: "anthropic",
  xai: "grok",
  azure: "azure-color",
  bedrock: "bedrock-color",
  groq: "groq",
  deepinfra: "deepinfra-color",
  mistral: "mistral-color",
  togetherai: "together-color",
  cohere: "cohere-color",
  fireworks: "fireworks-color",
  cerebras: "cerebras-color",
  replicate: "replicate",
  perplexity: "perplexity-color",
  ollama: "ollama",
  qwen: "bailian-color",
  moonshotai: "moonshot",
  huggingface: "huggingface-color",
  atlascloud: "atlascloud",
  openrouter: "openrouter",
  minimax: "minimax-color",
  siliconflow: "siliconcloud-color",
  volcengine: "volcengine-color",
  deepl: "deepl",
  deeplx: "deepl",
  "google-translate": "google-color",
  "microsoft-translate": "microsoft-color",
};
await mkdir(dest, { recursive: true });
const tasks = Object.entries(icons).flatMap(([id, slug]) =>
  ["light", "dark"].map((theme) => async () => {
    if (
      await access(new URL(id + "-" + theme + ".webp", dest)).then(
        () => true,
        () => false,
      )
    )
      return;
    const response = await fetch(
      "https://unpkg.com/@lobehub/icons-static-webp@" +
        version +
        "/" +
        theme +
        "/" +
        slug +
        ".webp",
    );
    if (!response.ok)
      throw Error(id + " " + theme + " HTTP " + response.status);
    await writeFile(
      new URL(id + "-" + theme + ".webp", dest),
      Buffer.from(await response.arrayBuffer()),
    );
  }),
);
let cursor = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (cursor < tasks.length) await tasks[cursor++]();
  }),
);
for (const theme of ["light", "dark"]) {
  await copyFile(
    new URL("jalapeno-cloud.png", reference),
    new URL("jalapenocloud-" + theme + ".png", dest),
  );
  await writeFile(
    new URL("tensdaq-" + theme + ".svg", dest),
    (await readFile(new URL("tensdaq-color.svg", reference), "utf8")).replace(
      /[\t ]+$/gm,
      "",
    ),
  );
}
const license = await fetch(
  "https://raw.githubusercontent.com/lobehub/lobe-icons/master/LICENSE",
);
if (!license.ok) throw Error("License fetch failed");
await writeFile(new URL("LICENSE.txt", dest), await license.text());
await writeFile(
  new URL("NOTICE.txt", dest),
  "LobeHub Icons @lobehub/icons-static-webp " +
    version +
    "; Copyright 2023 LobeHub; MIT (LICENSE.txt).\n" +
    "Jalapeno Cloud and Tensdaq provider marks: Read Frog GPL-3.0 source, commit 96083134b111e56762f578b143bcd48e85058ba3.\n" +
    "Source: https://github.com/mengxi-ream/read-frog/tree/96083134b111e56762f578b143bcd48e85058ba3/src/assets/providers\n" +
    "Brand marks identify API services and do not imply endorsement. Custom endpoint marks use Lucide (ISC).\n",
);
console.log(
  "Bundled " +
    (Object.keys(icons).length + 2) +
    " provider marks in both themes.",
);
