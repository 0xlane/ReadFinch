import { readFile, writeFile, mkdir } from "node:fs/promises";

const languages = JSON.parse(
  await readFile("src/shared/target-languages.json", "utf8"),
);
const copy = JSON.parse(await readFile("docs/readmes/content.json", "utf8"));
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const repo = "https://github.com/0xlane/ReadFinch";
const order = ["en", ...languages.map((l) => l.code).filter((c) => c !== "en")];
if (
  order.length !== Object.keys(copy).length ||
  order.some((code) => !copy[code])
) {
  throw Error(
    "README translations must cover exactly the app's target languages.",
  );
}
const escape = (text) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
await mkdir("docs/readmes", { recursive: true });

for (const code of order) {
  for (const key of Object.keys(copy.en)) {
    if (!(key in copy[code]))
      throw Error(`${code}: missing translation field ${key}`);
  }
  const c = copy[code],
    prefix = code === "en" ? "" : "../../";
  const local = (file) => prefix + file;
  const links = order
    .map((lang) => {
      const name = languages.find((l) => l.code === lang).name;
      const file =
        lang === "en" ? "README.md" : "docs/readmes/README." + lang + ".md";
      return lang === code
        ? "<strong>" + name + "</strong>"
        : '<a href="' + local(file) + '">' + name + "</a>";
    })
    .join(" · ");
  const localeImage = code.startsWith("zh") ? "zh-CN" : "en";
  const picture = (name, width, alt) => `<picture>
  <source media="(prefers-color-scheme: dark)" srcset="${local("docs/assets/" + name + "-" + localeImage + "-dark.png")}">
  <img src="${local("docs/assets/" + name + "-" + localeImage + "-light.png")}" width="${width}" alt="${escape(alt)}">
</picture>`;
  const featureRows = c.features
    .map(([name, body]) => "| **" + name + "** | " + body + " |")
    .join("\n");
  const shortcutRows = c.shortcuts
    .map((name, i) => {
      const win = [
        "Alt + T",
        "Alt + Shift + D",
        "Alt + Shift + W",
        "Ctrl + Shift + Space",
        "Ctrl + Shift + 2",
        "Ctrl + Shift + V",
      ][i];
      const mac = win.replace("Alt", "Option").replace("Ctrl", "Command");
      return "| " + name + " | `" + win + "` | `" + mac + "` |";
    })
    .join("\n");
  const text = `<!-- Generated from docs/readmes/content.json by npm run docs:readme. -->
<div align="center">
<a id="readme-top"></a>

<img src="${local("docs/assets/readfinch-banner.png")}" alt="ReadFinch · 伴读雀 — A little help, right beside your words." width="1280">

# ReadFinch · 伴读雀

**${c.tagline}**

${c.intro}

<p>${links}</p>

<p>
<a href="${local("LICENSE")}"><img src="https://img.shields.io/badge/License-GPL--3.0-4d443e?style=flat-square" alt="GPL-3.0-only"></a>
<img src="https://img.shields.io/badge/Version-${version}-4d443e?style=flat-square" alt="${version}">
<img src="https://img.shields.io/badge/OCR-Offline_+_Online-a9643f?style=flat-square" alt="${escape(c.ocrTitle)}">
<img src="https://img.shields.io/badge/AI-Bring_your_own_provider-74675d?style=flat-square" alt="Bring your own AI provider">
</p>

[${c.downloadLabel}](${repo}/releases/latest) · [${c.nav[0]}](#get-started) · [${c.nav[1]}](#features) · [${c.nav[2]}](#documentation) · [${c.nav[3]}](${repo}/issues)

</div>

## ${c.previewTitle}

${c.previewIntro}

<p align="center">
${picture("reading", 640, c.readingAlt)}
<br><em>${c.readingCaption}</em>
</p>

<a id="features"></a>

## ${c.featuresTitle}

| ${c.featureHeaders[0]} | ${c.featureHeaders[1]} |
| --- | --- |
${featureRows}

<details>
<summary><strong>${c.galleryTitle}</strong></summary>

<p align="center">
${picture("commands", 860, c.commandsAlt)}
<br><em>${c.commandsCaption}</em>
</p>

<p align="center">
${picture("notebook", 860, c.notebookAlt)}
<br><em>${c.notebookCaption}</em>
</p>

</details>

### ${c.ocrTitle}

${c.ocrIntro}

| ${c.ocrHeaders[0]} | ${c.ocrHeaders[1]} |
| --- | --- |
${c.ocrModes.map(([name, body]) => "| **" + name + "** | " + body + " |").join("\n")}

${c.ocrSetup}

### ${c.providerTitle}

${c.providers}

### ${c.languagesTitle}

${c.languages}

**English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Español**

${c.languageNote}

<a id="get-started"></a>

## ${c.startTitle}

**[${c.downloadLabel}](${repo}/releases/latest)**

${c.downloadIntro}

| ${c.downloadHeaders[0]} | ${c.downloadHeaders[1]} |
| --- | --- |
| Windows x64 | ${c.downloads[0]} |
| macOS | ${c.downloads[1]} |
| Linux x64 | ${c.downloads[2]} |

${c.updatesInfo}

### ${c.firstRunTitle}

${c.steps.map((step, i) => i + 1 + ". " + step).join("\n")}

### ${c.shortcutsTitle}

| ${c.shortcutHeaders[0]} | Windows / Linux | macOS |
| --- | --- | --- |
${shortcutRows}

${c.shortcutsNote}

### ${c.platformTitle}

| ${c.platformHeaders[0]} | ${c.platformHeaders[1]} |
| --- | --- |
| Windows | ${c.platforms[0]} |
| macOS | ${c.platforms[1]} |
| Linux | ${c.platforms[2]} |

${c.platformNote} [${c.platformLink}](${local("docs/PLATFORMS.md")})${code.startsWith("zh") || code === "ja" ? "。" : "."}

## ${c.dataTitle}

${c.data.map((p) => p).join("\n\n")}

<a id="documentation"></a>

## ${c.docsTitle}

- [${c.docs[0]}](${local("docs/ARCHITECTURE.md")})
- [${c.docs[1]}](${local("docs/MODELS.md")})
- [${c.docs[2]}](${local("docs/OCR.md")})
- [${c.docs[3]}](${local("docs/CONFIGURATION.md")})
- [${c.docs[4]}](${local("docs/PLATFORMS.md")})
- [${c.docs[5]}](${local("docs/LANGUAGES.md")})
- [${c.docs[6]}](${local("docs/UPDATES.md")})

${c.docsNote}

## ${c.contributeTitle}

${c.contribute} [${c.issueLink}](${repo}/issues) · [${c.prLink}](${repo}/pulls).

### ${c.buildTitle}

${c.buildIntro}

\`\`\`sh
git clone https://github.com/0xlane/ReadFinch.git
cd ReadFinch
npm ci
npm run assets:ocr
npm run build
npm start
\`\`\`

${c.buildNote}

\`\`\`sh
npm run typecheck
npm test
npm run build
\`\`\`

${c.translationNote}

## ${c.licenseTitle}

${c.license}

[GPL-3.0-only](${local("LICENSE")}) · [Read Frog](https://github.com/mengxi-ream/read-frog) · [${c.noticesLink}](${local("THIRD_PARTY_NOTICES.md")})

<div align="right">

[↑ ${c.top}](#readme-top)

</div>
`;
  await writeFile(
    code === "en" ? "README.md" : "docs/readmes/README." + code + ".md",
    text,
  );
}
console.log(
  "Generated " +
    order.length +
    " READMEs, default English; languages match the app.",
);
