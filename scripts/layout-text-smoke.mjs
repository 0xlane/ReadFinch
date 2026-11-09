import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { _electron as electron } from "playwright";

const dir = path.resolve(".local/layout-text-" + Date.now());
await mkdir(dir, { recursive: true });
await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { flushSync } from "react-dom";
      import { SchemaResult } from "./src/renderer/SchemaResult";
      import { renderCard } from "./src/renderer/action-layout";
      import { definition } from "./src/shared/action-templates";
      const root = createRoot(document.getElementById("root"));
      window.readfinch = { call: async (method, args) => { if (method === "clipboardWrite") window.copiedText = args.text; } };
      window.showResult = (source, revision, finished, locale = "zh-CN", stage = "ready") => {
        const view = definition("polish", locale);
        const values = ["Technical support request", JSON.stringify([{text:"Help me", replacement:"Please help me", note:"Polite request", tier:"awkward"}]), revision, "Preserves the error details."];
        const output = Object.fromEntries(view.outputSchema.filter(f => f.source === "model").map((f, i) => [f.name, values[i]]));
        const text = stage === "empty" ? "" : stage === "setting" ? JSON.stringify({[view.outputSchema[1].name]: values[0]}).slice(0, -1) : JSON.stringify(output);
        flushSync(() => root.render(<SchemaResult view={view} source={source} text={finished ? text : text.slice(0, -1)} targetLanguage="English" finished={finished} />));
      };
      window.checkUnsafe = () => {
        const result = renderCard({outputSchema:[{id:"text",name:"text",type:"string",source:"model",description:""}],layout:'<img src="https://example.invalid/probe"><button onclick="alert(1)" data-speak="javascript:literal text">Speak</button><script>alert(1)</script>'}, {}, "", "", "done");
        return { warning: result.warning, unsafe: result.body.querySelectorAll("img,script,[onclick]").length, speech: result.body.querySelector("button").dataset.speak };
      };
    `,
  },
  bundle: true,
  outfile: path.join(dir, "fixture.js"),
  plugins: [
    {
      name: "inline-css",
      setup(builder) {
        builder.onResolve({ filter: /\?inline$/ }, (args) => ({
          path: path.resolve(
            args.resolveDir,
            args.path.replace(/\?inline$/, ""),
          ),
          namespace: "inline-css",
        }));
        builder.onLoad(
          { filter: /.*/, namespace: "inline-css" },
          async (args) => ({
            contents: await readFile(args.path, "utf8"),
            loader: "text",
          }),
        );
      },
    },
  ],
});
await writeFile(
  path.join(dir, "index.html"),
  '<html data-theme="light"><meta charset="utf-8"><style>body{font:15px system-ui;margin:24px;color:#222}.layout-warning{color:red}</style><div id="root"></div><script src="fixture.js"></script></html>',
);
await writeFile(
  path.join(dir, "main.cjs"),
  'const {app,BrowserWindow}=require("electron");app.whenReady().then(()=>{const win=new BrowserWindow({width:700,height:900,show:false,webPreferences:{sandbox:true}});win.loadFile(__dirname+"/index.html")});',
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [path.join(dir, "main.cjs")], env });
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => typeof window.showResult === "function");
  const source =
    "Help me solve this error: bsk daemon start\n\nerror: cannot start an independent Windows daemon; the daemon process was created but still belongs to a Job Object after breakaway; use `bsk daemon start --foreground` in a persistent host task: daemon process still belongs to a Job Object after breakaway\nhint: The daemon process was created, so the immediate Job Object allows breakaway, but the process still belongs to a Job Object after breakaway, for example an outer Job held by an IDE, a launcher or a system service. Run `bsk daemon start --foreground` in a persistent host task that outlives client commands. If another host or terminal does not run inside that Job, `bsk daemon start` from there can succeed. Use the same BSK_HOME and OS user as the clients. Then set BSK_AUTO_START=0 for client commands and verify `bsk status --json` in a separate invocation.";
  for (const original of [
    source,
    '  javascript:example\n</script><!-- --> "quotes" <tag> & {{ value }}\n  ',
  ]) {
    const revision = original.replace("Help me", "Please help me");
    for (const locale of ["zh-CN", "en"]) {
      for (const finished of [false, true]) {
        await page.evaluate(
          (args) => window.showResult(...args),
          [original, revision, finished, locale],
        );
        assert.equal(await page.locator(".revision").textContent(), revision);
        const preserved = await page
          .locator("[data-writing]")
          .evaluate((el) => el.dataset.original);
        assert.equal(preserved, original);
        assert.equal(await page.locator(".layout-warning").count(), 0);
        assert.equal(await page.locator("script:not([src]),img").count(), 0);
      }
    }
  }
  await page.evaluate(
    (text) =>
      window.showResult(text, text.replace("Help me", "Please help me"), true),
    source,
  );
  assert.equal(await page.locator(".writing-annotation").count(), 1);
  const revision = source.replace("Help me", "Please help me");
  await page.getByRole("button", { name: "复制结果", exact: true }).click();
  assert.equal(await page.evaluate(() => window.copiedText), revision);
  for (const stage of ["empty", "setting"]) {
    await page.evaluate(
      (args) => window.showResult(...args),
      [source, "", false, "zh-CN", stage],
    );
    assert.equal(await page.locator(".writing-pending").count(), 1);
    assert.equal(
      await page.getByRole("button", { name: "改后", exact: true }).count(),
      0,
    );
  }
  await page.evaluate((args) => window.showResult(...args), [source, "", true]);
  assert.equal(await page.locator(".writing-pending").count(), 0);
  assert.equal(await page.locator(".writing-revision").count(), 0);
  await page.evaluate(
    (args) => window.showResult(...args),
    [source, revision, true],
  );
  await page.screenshot({
    path: path.join(dir, "writing-result.png"),
    fullPage: true,
  });
  const unsafe = await page.evaluate(() => window.checkUnsafe());
  assert.ok(unsafe.warning);
  assert.equal(unsafe.unsafe, 0);
  assert.equal(unsafe.speech, "javascript:literal text");
  console.log(
    "Writing source, revision, annotations, streaming, both locales, literal markup and unsafe-layout rejection passed.",
  );
  console.log(path.join(dir, "writing-result.png"));
} finally {
  await app.close();
}
