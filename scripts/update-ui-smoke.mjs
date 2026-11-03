import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const directory = path.resolve(".local/update-ui-" + Date.now());
const output = "docs/screenshots/current";
await mkdir(directory, { recursive: true });
await mkdir(output, { recursive: true });
const env = { ...process.env, READFINCH_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const errors = [],
  checks = [];
async function launch() {
  app = await electron.launch({
    args: [".", "--settings", "--data-dir=" + directory],
    env,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.locator("main h1").waitFor();
  return page;
}
async function language(page, value) {
  await page.evaluate(async (value) => {
    const state = await window.readfinch.call("snapshot");
    state.config.appearance.language = value;
    state.config.selection.automatic = false;
    state.config.shortcuts = { selection: "", capture: "", clipboard: "" };
    state.config.actions.forEach((action) => (action.shortcut = ""));
    await window.readfinch.call("saveConfig", {
      config: state.config,
      revision: state.revision,
    });
  }, value);
}
async function state(value) {
  await app.evaluate(
    (_electron, value) => globalThis.__readfinchTest.updateView(value),
    value,
  );
}
try {
  let page = await launch();
  assert.equal(
    (await page.evaluate(() => window.readfinch.call("snapshot"))).updates
      .automatic,
    true,
  );
  await language(page, "en");
  await page.getByRole("button", { name: "About", exact: true }).click();
  await page
    .getByRole("heading", { name: "About ReadFinch", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("switch", { name: "Automatic updates" })
      .getAttribute("aria-checked"),
    "true",
  );
  await page.getByRole("switch", { name: "Automatic updates" }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[role="switch"][aria-label="Automatic updates"]')
        ?.getAttribute("aria-checked") === "false",
  );
  assert.equal(
    JSON.parse(
      await readFile(path.join(directory, "device-updates.json"), "utf8"),
    ).automatic,
    false,
  );
  assert.equal(
    Object.hasOwn(
      JSON.parse(await readFile(path.join(directory, "config.json"), "utf8")),
      "updates",
    ),
    false,
  );
  checks.push(
    "Automatic updates default on, save immediately, and stay separate from portable configuration",
  );
  await app.close();
  page = await launch();
  assert.equal(
    (await page.evaluate(() => window.readfinch.call("snapshot"))).updates
      .automatic,
    false,
  );
  checks.push("Update preference survives an application restart");

  await app.evaluate(({ shell }) => {
    globalThis.__projectLinks = [];
    shell.openExternal = async (url) => {
      globalThis.__projectLinks.push(url);
    };
  });
  await page.getByRole("button", { name: "About", exact: true }).click();
  await page.getByRole("heading", { name: "About ReadFinch" }).waitFor();
  await page.locator(".about-icon").waitFor();
  assert.equal(
    await page
      .locator(".about-icon")
      .evaluate((image) => image.complete && image.naturalWidth > 0),
    true,
  );
  await page.getByRole("button", { name: /Source code/ }).click();
  await page.getByRole("button", { name: /Feedback and ideas/ }).click();
  const links = await app.evaluate(() => globalThis.__projectLinks);
  assert.deepEqual(links, [
    "https://github.com/0xlane/ReadFinch",
    "https://github.com/0xlane/ReadFinch/issues/new/choose",
  ]);
  const blocked = await page.evaluate(async () => {
    try {
      await window.readfinch.call("openProjectLink", {
        link: "file:///arbitrary",
      });
      return false;
    } catch {
      return true;
    }
  });
  assert.ok(blocked);
  await state({
    status: "latest",
    installMode: "automatic",
    automatic: true,
    checkedAt: new Date().toISOString(),
  });
  await page.getByRole("heading", { name: "You are up to date" }).waitFor();
  await page.mouse.move(20, 20);
  await page.locator("main").evaluate((element) => element.scrollTo(0, 0));
  await page.screenshot({ path: output + "/about-light.png" });
  await page.evaluate(() =>
    window.readfinch.call("setTheme", { theme: "dark" }),
  );
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await state({
    status: "latest",
    installMode: "automatic",
    automatic: true,
    checkedAt: new Date().toISOString(),
  });
  await page.getByRole("heading", { name: "You are up to date" }).waitFor();
  await page.screenshot({ path: output + "/about-dark.png" });
  checks.push(
    "About shows the brand, version, source, feedback and licenses; only fixed project links can open",
  );

  await page.getByRole("button", { name: "About", exact: true }).click();
  await state({
    status: "latest",
    installMode: "automatic",
    checkedAt: new Date().toISOString(),
  });
  await page.getByRole("heading", { name: "You are up to date" }).waitFor();
  await page.screenshot({ path: output + "/updates-dark.png" });
  await page.evaluate(() =>
    window.readfinch.call("setTheme", { theme: "light" }),
  );
  await state({
    status: "downloading",
    automatic: true,
    checkedAt: new Date().toISOString(),
    installMode: "automatic",
    availableVersion: "1.1.0",
    source: "gh-proxy",
    progress: {
      percent: 42,
      transferred: 63000000,
      total: 150000000,
      bytesPerSecond: 4200000,
    },
  });
  await page
    .getByRole("progressbar", { name: "Update download progress" })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Check for updates" }).isDisabled(),
    true,
  );
  await page.screenshot({ path: output + "/updates-downloading.png" });
  assert.ok(
    !/github|gh-proxy/i.test(await page.locator(".about-updates").innerText()),
  );
  assert.equal(
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Software updates", exact: true })
      .count(),
    0,
  );
  checks.push(
    "Updates share the About page; download routes switch internally and never appear in the update card",
  );
  await state({
    status: "downloaded",
    installMode: "automatic",
    availableVersion: "1.1.0",
    automatic: false,
  });
  await page.getByRole("button", { name: "Restart to update" }).waitFor();
  assert.equal(await page.locator(".sidebar-update-dot").count(), 1);
  assert.ok(
    (await page.locator(".update-ready-copy").innerText()).includes("off"),
  );
  await state({
    status: "error",
    installMode: "automatic",
    error: "更新清单校验失败，已停止更新。",
  });
  await page.getByRole("alert").waitFor();
  assert.ok((await page.getByRole("alert").innerText()).includes("verified"));
  assert.equal(
    await page.getByRole("button", { name: "Check for updates" }).isEnabled(),
    true,
  );
  checks.push(
    "Current, download progress, proxy fallback, ready, and error views have the correct controls",
  );

  await language(page, "zh-CN");
  await state({
    status: "latest",
    automatic: true,
    installMode: "automatic",
    checkedAt: new Date().toISOString(),
  });
  await page.getByRole("heading", { name: "已是最新版本" }).waitFor();
  await page.screenshot({ path: output + "/updates-zh-CN.png" });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((win) => win.webContents.getURL().includes("mode=main"))
      .setSize(980, 650),
  );
  const layout = await page.evaluate(() => {
    const sidebar = document.querySelector(".settings-sidebar"),
      button = document.querySelector(".sidebar-system button:last-child");
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      sidebarOverflow: sidebar.scrollWidth > sidebar.clientWidth,
      bottom: button.getBoundingClientRect().bottom,
      height: innerHeight,
    };
  });
  assert.equal(layout.overflow, false);
  assert.equal(layout.sidebarOverflow, false);
  assert.ok(layout.bottom < layout.height);
  checks.push(
    "Chinese and English, both themes, and a compact window preserve readable navigation",
  );
  const nextWindow = app.waitForEvent("window");
  await page.evaluate(async () => {
    await window.readfinch.call("panelOpen", { source: "empty" });
  });
  const panel = await nextWindow;
  await panel.locator("#root > *").waitFor();
  const rejected = await panel.evaluate(async () => {
    try {
      await window.readfinch.call("updateInstall");
      return false;
    } catch {
      return true;
    }
  });
  assert.ok(rejected);
  checks.push(
    "Floating panels cannot install updates or change update preferences",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/update-ui-verification.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        version: JSON.parse(await readFile("package.json", "utf8")).version,
        checks,
        errors,
        scope:
          "Real settings windows and persistence. Update presentation states use development-only hooks; manifest, transport, hashes, and updater coordination are covered by separate tests. No installer is executed by this UI test.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(checks.join("\n"));
} finally {
  await app?.close();
}
