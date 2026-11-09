import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
const dir = path.resolve(".local/diagnostics-ui-" + Date.now());
await mkdir(dir, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  args: [".", "--settings", "--data-dir=" + dir],
  env,
});
try {
  const page = await app.firstWindow();
  await page.locator("main h1").waitFor();
  await page.evaluate(async () => {
    const s = await window.readfinch.call("snapshot");
    s.config.appearance.language = "zh-CN";
    s.config.selection.automatic = false;
    await window.readfinch.call("saveConfig", {
      config: s.config,
      revision: s.revision,
    });
  });
  await page.getByRole("button", { name: "关于", exact: true }).click();
  const button = page.getByRole("button", {
    name: "导出诊断日志",
    exact: true,
  });
  await button.scrollIntoViewIfNeeded();
  const reportPath = path.join(dir, "export.json");
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, reportPath);
  await button.click();
  await page.getByText("诊断日志已导出", { exact: true }).waitFor();
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert(report.environment.appVersion);
  assert(report.events.some((e) => e.event === "app_start"));
  assert(report.events.every((e) => e.time && e.session));
  assert(!JSON.stringify(report).includes(dir));
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => window.readfinch.call("setTheme", { theme }),
      theme,
    );
    await page
      .locator(".about-diagnostics")
      .screenshot({ path: path.join(dir, theme + ".png") });
  }
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: true });
  });
  await button.click();
  await page.waitForFunction(
    () => !document.querySelector(".about-diagnostics button").disabled,
  );
  assert.equal(
    await page.getByText("诊断日志已导出", { exact: true }).count(),
    0,
  );
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => {
      throw Error("private path must not be displayed");
    };
  });
  await button.click();
  await page.getByText("诊断日志导出失败，请重试。", { exact: true }).waitFor();
  assert(!(await page.locator("body").innerText()).includes("private path"));
  await page.evaluate(() =>
    window.readfinch.call("panelOpen", { source: "empty" }),
  );
  let panel;
  for (let n = 0; n < 50; n++) {
    panel = app.windows().find((p) => p.url().includes("mode=panel"));
    if (panel) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await panel.locator("#root > *").waitFor();
  assert(
    await panel.evaluate(async () => {
      try {
        await window.readfinch.call("exportDiagnostics");
        return false;
      } catch {
        return true;
      }
    }),
  );
  console.log(
    "PASS: real diagnostic export, cancellation, safe error, light/dark UI and settings-only permission.",
  );
  console.log(dir);
} finally {
  await app.close();
}
