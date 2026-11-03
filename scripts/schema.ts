import { z } from "zod";
import { writeFile } from "node:fs/promises";
import { ConfigSchema, defaultConfig } from "../src/shared/config";
const schema = z.toJSONSchema(ConfigSchema);
await writeFile(
  "docs/config.schema.json",
  JSON.stringify(
    {
      ...schema,
      $id: "https://readfinch.local/schema/config-v14.json",
      $comment:
        "Unique IDs, enabled provider references and shortcut conflicts are checked by src/shared/config.ts.",
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  "docs/example-config.json",
  JSON.stringify(defaultConfig(), null, 2) + "\n",
);
