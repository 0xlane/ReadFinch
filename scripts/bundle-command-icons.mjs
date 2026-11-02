// Rebuild the offline glyph sheets from the three Iconify packages used by Read Frog.
// Pass a directory containing tabler-icons/package, ri-icons/package and streamline-icons/package.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const input = process.argv[2];
if (!input) throw new Error("Pass the directory containing the Iconify packs.");
const out = "src/renderer/public/command-icons";
await mkdir(out, { recursive: true });
const names = {};
for (const dir of ["tabler-icons", "ri-icons", "streamline-icons"]) {
  const pack = JSON.parse(
    await readFile(path.join(input, dir, "package/icons.json"), "utf8"),
  );
  const ids = Object.keys(pack.icons).sort();
  names[pack.prefix] = ids;
  for (let start = 0; start < ids.length; start += 128) {
    const cells = ids.slice(start, start + 128).map((id, i) => {
      const icon = pack.icons[id],
        width = icon.width ?? pack.width ?? 16,
        height = icon.height ?? pack.height ?? 16;
      let body = icon.body;
      for (const match of icon.body.matchAll(/\bid="([^"]+)"/g)) {
        body = body
          .replaceAll(
            'id="' + match[1] + '"',
            'id="g' + i + "-" + match[1] + '"',
          )
          .replaceAll("#" + match[1] + ")", "#g" + i + "-" + match[1] + ")")
          .replaceAll(
            '="#' + match[1] + '"',
            '="#g' + i + "-" + match[1] + '"',
          );
      }
      return (
        '<svg x="' +
        (i % 16) * 24 +
        '" y="' +
        Math.floor(i / 16) * 24 +
        '" width="24" height="24" viewBox="' +
        [icon.left ?? 0, icon.top ?? 0, width, height].join(" ") +
        '">' +
        body +
        "</svg>"
      );
    });
    await writeFile(
      path.join(out, pack.prefix + "-" + Math.floor(start / 128) + ".svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="384" height="192" viewBox="0 0 384 192">' +
        cells.join("") +
        "</svg>\n",
    );
  }
}
await writeFile("src/shared/icon-names.json", JSON.stringify(names) + "\n");
console.log(
  Object.entries(names)
    .map(([set, list]) => set + ": " + list.length)
    .join(", "),
);
