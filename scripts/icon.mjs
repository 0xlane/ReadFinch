import { Resvg } from "@resvg/resvg-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// One vector master supplies every app, UI and tray asset.
const source = await readFile("assets/brand/mark.svg", "utf8");
const mark = source
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "");
const publicDir = "src/renderer/public";
await mkdir(`${publicDir}/brand`, { recursive: true });
function svg(content, viewBox = "0 0 128 128") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="${viewBox}" fill="none">${content}</svg>`;
}
const tile = (paint) =>
  `<rect x="4" y="4" width="120" height="120" rx="29" fill="${paint}"/>`;
function glyph({ mono, small = false } = {}) {
  let value = mark;
  if (mono)
    value = value.replaceAll("#F8F8EE", mono).replaceAll("#B7E4AA", mono);
  if (small) value = `<g transform="translate(-2 -2) scale(1.04)">${value}</g>`;
  return value;
}
const application = svg(`<defs>
  <linearGradient id="forest" x1="20" y1="4" x2="102" y2="124" gradientUnits="userSpaceOnUse">
    <stop stop-color="#205A46"/><stop offset=".52" stop-color="#123F32"/><stop offset="1" stop-color="#092B24"/>
  </linearGradient>
</defs>${tile("url(#forest)")}<rect x="4.75" y="4.75" width="118.5" height="118.5" rx="28.25" stroke="#FFFFFF" stroke-opacity=".11" stroke-width="1.5"/>${glyph()}`);
const optical = svg(tile("#174734") + glyph({ mono: "#F8F8EE", small: true }));
const paused = svg(tile("#626E67") + glyph({ mono: "#EEF0E9", small: true }));
const template = svg(glyph({ mono: "#000000", small: true }), "18 16 94 94");
const monoLight = svg(glyph({ mono: "#F8F8EE" }));
const monoDark = svg(glyph({ mono: "#234E3C" }));
const png = (art, size) =>
  new Resvg(art, {
    fitTo: { mode: "width", value: size },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
function ico(frames) {
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  for (let i = 0; i < frames.length; i++) {
    const { size, data } = frames[i];
    const entry = 6 + i * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  }
  return Buffer.concat([header, ...frames.map((f) => f.data)]);
}
await writeFile(`${publicDir}/icon.png`, png(application, 1024));
await writeFile(`${publicDir}/brand/icon.svg`, application);
await writeFile(`${publicDir}/brand/mark-light.svg`, monoLight);
await writeFile(`${publicDir}/brand/mark-dark.svg`, monoDark);
await writeFile(`${publicDir}/brand/icon-small.svg`, optical);
await writeFile(`${publicDir}/brand/tray-paused.svg`, paused);
for (const size of [16, 20, 24, 32, 40, 48, 64, 128, 256, 512]) {
  await writeFile(
    `${publicDir}/brand/icon-${size}.png`,
    png(size <= 32 ? optical : application, size),
  );
}
for (const [name, art] of [
  ["tray", optical],
  ["tray-paused", paused],
]) {
  for (const size of [16, 20, 24, 32, 40, 48])
    await writeFile(`${publicDir}/brand/${name}-${size}.png`, png(art, size));
  await writeFile(
    `${publicDir}/brand/${name}.ico`,
    ico(
      [16, 20, 24, 32, 40, 48].map((size) => ({ size, data: png(art, size) })),
    ),
  );
}
// Template images carry alpha; macOS chooses the display color.
await writeFile(`${publicDir}/brand/trayTemplate.png`, png(template, 18));
await writeFile(`${publicDir}/brand/trayTemplate@2x.png`, png(template, 36));
await writeFile(
  `${publicDir}/icon.ico`,
  ico(
    [16, 20, 24, 32, 40, 48, 64, 128, 256].map((size) => ({
      size,
      data: png(size <= 32 ? optical : application, size),
    })),
  ),
);
console.log(
  "Brand assets generated from assets/brand/mark.svg (16–1024 px, ICO and template tray).",
);
