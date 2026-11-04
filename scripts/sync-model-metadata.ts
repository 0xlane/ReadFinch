import { readFile, writeFile } from "node:fs/promises";
import {
  directoryUrls,
  parseDirectory,
  type DirectorySource,
} from "../src/shared/model-directory";

// Update the bundled fallback deliberately; release builds never need the network for this.
const entries = await Promise.all(
  (Object.keys(directoryUrls) as DirectorySource[]).map(async (key, i) => {
    const file = process.argv[i + 2];
    const data = file
      ? JSON.parse(await readFile(file, "utf8"))
      : await (async () => {
          const response = await fetch(directoryUrls[key], {
            signal: AbortSignal.timeout(30000),
          });
          if (!response.ok) throw Error(key + ": " + response.status);
          return response.json();
        })();
    return [key, parseDirectory(key, data)] as const;
  }),
);
// One record per line keeps snapshot updates reviewable.
const json =
  "{\n" +
  entries
    .map(
      ([key, rows]) =>
        '  "' +
        key +
        '": [\n' +
        rows.map((row) => "    " + JSON.stringify(row)).join(",\n") +
        "\n  ]",
    )
    .join(",\n") +
  "\n}\n";
await writeFile(
  new URL("../src/shared/model-directory.json", import.meta.url),
  json,
);
console.log(entries.map(([key, rows]) => key + ": " + rows.length).join(", "));
