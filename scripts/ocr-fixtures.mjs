import { _electron as electron } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
await mkdir("tests/fixtures", { recursive: true });
const app = await electron.launch({
  args: [
    ".",
    `--data-dir=${path.resolve(".local/ocr-fixtures-" + Date.now())}`,
  ],
  env,
});
try {
  const readyPage = await app.firstWindow();
  await readyPage.getByText("让文字，自在流动。").waitFor();
  for (const item of [
    { name: "bilingual-dark", dark: true, size: 24 },
    { name: "small-interface", dark: true, size: 13 },
  ]) {
    const image = await app.evaluate(async ({ BrowserWindow }, item) => {
      const w = new BrowserWindow({
        width: 900,
        height: 380,
        show: false,
        webPreferences: { sandbox: true, offscreen: true },
      });
      const text =
        item.size === 13
          ? "Error 42: connection refused<br>你好，世界！小字号混合文字。<br><code>C:\\Projects\\TextHop<br>const total = 42; // Hello 世界</code>"
          : "TextHop · 让文字自在流动<br>Small steps make a big difference.<br>你好，世界！每一小步，都能带来改变。<br><code>C:\\Projects\\TextHop\\src\\main.ts<br>const total = 42; // Hello 世界</code>";
      await w.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<style>body{background:${item.dark ? "#19221d" : "white"};color:${item.dark ? "#e9f2e9" : "#19221d"};font:${item.size}px "Microsoft YaHei",Arial;padding:28px;line-height:1.9}code{font:${item.size - 2}px Consolas}</style>${text}`,
          ),
      );
      await new Promise((r) => setTimeout(r, 250));
      const data = (await w.webContents.capturePage()).toDataURL();
      w.destroy();
      return data;
    }, item);
    await writeFile(
      `tests/fixtures/${item.name}.png`,
      Buffer.from(image.split(",")[1], "base64"),
    );
  }
  const page = await app.firstWindow();
  console.log(
    await page.evaluate(() => ({
      body: getComputedStyle(document.body).fontFamily,
      source: document.querySelector("textarea")
        ? getComputedStyle(document.querySelector("textarea")).fontFamily
        : "loading",
      dpr: devicePixelRatio,
    })),
  );
} finally {
  await app.close();
}
