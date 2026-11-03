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
  await readyPage.locator("main h1").waitFor();
  for (const item of [
    { name: "bilingual-light", dark: false, size: 30 },
    { name: "bilingual-dark", dark: true, size: 24 },
    { name: "small-interface", dark: true, size: 13 },
  ]) {
    const image = await app.evaluate(async ({ BrowserWindow }, item) => {
      const w = new BrowserWindow({
        width: item.dark ? 900 : 1100,
        height: item.dark ? 380 : 430,
        show: false,
        webPreferences: { sandbox: true, offscreen: true },
      });
      const text =
        item.size === 13
          ? "Error 42: connection refused<br>你好，世界！小字号混合文字。<br><code>C:\\Projects\\ReadFinch<br>const total = 42; // Hello 世界</code>"
          : "<h1>ReadFinch · 让文字自在流动</h1>Small steps make a big difference.<br>你好，世界！每一小步，都能带来改变。<br><code>C:\\Projects\\ReadFinch\\src\\main.ts<br>const total = 42; // Hello 世界</code>";
      await w.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<style>body{background:${item.dark ? "#19221d" : "white"};color:${item.dark ? "#e9f2e9" : "#19221d"};font:${item.size}px "Microsoft YaHei",Arial;padding:28px;line-height:1.9}h1{font-size:${item.dark ? item.size : item.size + 8}px;font-weight:${item.dark ? 400 : 700};margin:0 0 ${item.dark ? 0 : 20}px}code{font:${item.size - (item.dark ? 2 : 6)}px Consolas}</style>${text}`,
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
