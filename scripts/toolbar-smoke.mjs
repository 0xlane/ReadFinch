import { _electron as electron } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const dir = path.resolve(".local/toolbar-" + Date.now()),
  output = process.argv.includes("--verify-only")
    ? dir
    : "docs/screenshots/current";
await mkdir(dir, { recursive: true });
await mkdir(output, { recursive: true });
const env = { ...process.env, READFINCH_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
let app, main, pill;
const checks = [];
const check = (s) => {
  checks.push(s);
  console.log(s);
};
async function launch() {
  app = await electron.launch({
    args: [
      ".",
      "--settings",
      "--data-dir=" + dir,
      ...process.argv
        .slice(2)
        .filter((arg) => arg.startsWith("--force-device-scale-factor=")),
    ],
    env,
  });
  main = await app.firstWindow();
  main.setDefaultTimeout(7000);
  await main.locator("main h1").waitFor();
}
const call = (m, arg) =>
  main.evaluate(([m, arg]) => window.readfinch.call(m, arg), [m, arg]);
const state = () => call("snapshot");
const visible = () =>
  app.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("mode=pill"))
        ?.isVisible() ?? false,
  );
async function until(predicate, label) {
  for (let i = 0; i < 80; i++) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 75));
  }
  throw Error("Timed out: " + label);
}
let seq = 0;
async function select(name = "Reader") {
  await app.evaluate(
    ({ screen }, a) => {
      const area = screen.getPrimaryDisplay().workArea;
      globalThis.__readfinchTest.select(a, {
        x: area.x + Math.round(area.width * 0.4),
        y: area.y + Math.round(area.height * 0.38),
      });
    },
    {
      app: name,
      token: "s" + ++seq,
      text: "A selected sentence.",
      x: 200,
      y: 200,
      canReplace: false,
    },
  );
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
async function disable() {
  await pill.locator(".selection-toolbar").hover();
  await button(pill, "关闭划词工具栏").click();
  await button(pill, "全局禁用").waitFor();
}
async function shot(name) {
  await pill.waitForTimeout(140);
  await pill.screenshot({
    omitBackground: true,
    path: output + "/" + name + ".png",
  });
}
try {
  await launch();
  const s = await state();
  s.config.appearance.language = "zh-CN";
  await call("saveConfig", { config: s.config, revision: s.revision });
  await call("setTheme", { theme: "light" });
  await select();
  await until(
    () => app.windows().some((w) => w.url().includes("mode=pill")),
    "toolbar window",
  );
  pill = app.windows().find((w) => w.url().includes("mode=pill"));
  pill.setDefaultTimeout(7000);
  await button(pill, "更多指令").waitFor();
  await shot("toolbar-light");
  const frame = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("mode=pill"))
        .getBounds(),
    );
  const beforeHover = await frame(),
    barBefore = await pill.locator(".selection-toolbar").boundingBox();
  if (process.platform === "darwin") {
    await until(visible, "native macOS toolbar");
    const properties = await app.evaluate(({ BrowserWindow }) => {
      const toolbar = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes("mode=pill"),
      );
      return [
        toolbar.isFocused(),
        toolbar.isFocusable(),
        toolbar.isVisibleOnAllWorkspaces(),
      ];
    });
    assert.deepEqual(properties, [false, false, true]);
    check(
      "macOS shows the toolbar across Spaces without taking keyboard focus",
    );
  }
  async function checkWindowsPixels() {
    if (process.platform !== "win32") return;
    const handle = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("mode=pill"))
        .getNativeWindowHandle()
        .readBigUInt64LE()
        .toString(),
    );
    const rect = await pill.getByRole("toolbar").evaluate((el) => {
      const b = el.getBoundingClientRect();
      return [
        b.x / innerWidth,
        b.y / innerHeight,
        b.width / innerWidth,
        b.height / innerHeight,
      ].map(String);
    });
    execFileSync(path.join(dir, "ToolbarHitTest.exe"), [handle, ...rect], {
      windowsHide: true,
    });
  }
  if (process.platform === "win32") {
    execFileSync(
      path.join(
        process.env.WINDIR,
        "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
      ),
      [
        "/nologo",
        "/r:System.Drawing.dll",
        "/out:" + path.join(dir, "ToolbarHitTest.exe"),
        path.resolve("tests/fixtures/ToolbarHitTest.cs"),
      ],
      { windowsHide: true, stdio: "inherit" },
    );
    await checkWindowsPixels();
  }
  await pill.evaluate(() => {
    window.menuShows = 0;
    new MutationObserver((changes) => {
      for (const change of changes)
        for (const added of change.addedNodes)
          if (added.nodeType === 1 && added.matches(".toolbar-menu"))
            window.menuShows++;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await button(pill, "更多指令").hover();
  await pill.locator(".toolbar-menu").waitFor();
  await pill.locator(".toolbar-row").first().hover();
  await pill.waitForTimeout(350);
  assert.equal(await pill.evaluate(() => window.menuShows), 1);
  const afterHover = await frame();
  const barAfter = await pill.locator(".selection-toolbar").boundingBox();
  await checkWindowsPixels();
  for (const axis of ["x", "y"]) {
    assert.ok(
      Math.abs(
        beforeHover[axis] + barBefore[axis] - afterHover[axis] - barAfter[axis],
      ) <= 1,
      "Menu displaced the icon strip on screen",
    );
  }
  if (process.platform === "win32") {
    assert.ok(
      beforeHover.height <= barBefore.height + 17,
      "Closed toolbar has a hidden menu-sized window",
    );
    assert.ok(afterHover.height > beforeHover.height);
  }
  if (process.platform === "linux") {
    assert.deepEqual(await frame(), beforeHover);
    assert.deepEqual(
      await pill.locator(".selection-toolbar").boundingBox(),
      barBefore,
    );
  }
  check(
    "Hover opens the menu once and crossing into the rows keeps the icon strip stationary on screen",
  );
  const more = button(pill, "更多指令");
  const menu = pill.locator(".toolbar-menu:not(.disable-menu)");
  async function leaveMore() {
    await pill.mouse.move(1, 1);
    await menu.waitFor({ state: "hidden" });
    assert.equal(await visible(), true, "only the expanded menu should close");
    assert.equal(await more.getAttribute("aria-expanded"), "false");
  }
  async function hoverMore() {
    await more.hover();
    await menu.waitFor();
    // Electron may move the enclosing window while preserving the bar's screen
    // position. CDP pointer coordinates are viewport-relative, so settle them
    // against the expanded layout before testing a stationary hover.
    await more.hover();
  }
  await leaveMore();
  await hoverMore();
  await more.click();
  await menu.waitFor({ state: "hidden" });
  await pill.waitForTimeout(350);
  assert.equal(
    await menu.count(),
    0,
    "click-closing must not immediately reopen under the pointer",
  );
  await more.click();
  await menu.waitFor();
  await leaveMore();
  await hoverMore();
  await pill
    .getByRole("toolbar")
    .getByRole("button", { name: "翻译", exact: true })
    .hover();
  await menu.waitFor({ state: "hidden" });
  check(
    "More closes on pointer exit or a click after hover expansion; click-opened menus also auto-close, and hovering another toolbar action closes More",
  );
  await hoverMore();
  const rows = pill.locator(".toolbar-row");
  assert.equal(
    await rows.count(),
    s.config.actions.filter((a) => a.enabled).length + 1,
  );
  assert.ok(!app.windows().some((w) => w.url().includes("mode=panel")));
  for (const theme of ["light", "dark"]) {
    await call("setTheme", { theme });
    await pill.waitForFunction(
      (v) => document.documentElement.dataset.theme === v,
      theme,
    );
    await shot("toolbar-more-" + theme);
  }
  await button(pill, "固定 词典").click();
  await until(
    async () =>
      (await state()).config.actions.find((a) => a.id === "dictionary")
        .pinned === false,
    "unpin",
  );
  assert.equal(
    await pill
      .getByRole("toolbar")
      .getByRole("button", { name: "词典", exact: true })
      .count(),
    0,
  );
  await button(pill, "固定 词典").click();
  await until(
    async () =>
      (await state()).config.actions.find((a) => a.id === "dictionary").pinned,
    "repin",
  );
  const grip = button(pill, "调整顺序 朗读");
  await grip.focus();
  await grip.press("ArrowDown");
  await until(
    async () => (await state()).config.selection.speechIndex === 2,
    "reorder",
  );
  const from = await grip.boundingBox(),
    to = await button(pill, "调整顺序 词典").boundingBox();
  await pill.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await pill.mouse.down();
  await pill.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 6,
  });
  await pill.mouse.up();
  await until(
    async () => (await state()).config.selection.speechIndex === 1,
    "pointer reorder",
  );
  const dragStart = await grip.boundingBox();
  await pill.mouse.move(
    dragStart.x + dragStart.width / 2,
    dragStart.y + dragStart.height / 2,
  );
  await pill.mouse.down();
  await pill.mouse.move(1, 1, { steps: 4 });
  await pill.waitForTimeout(300);
  assert.equal(
    await menu.isVisible(),
    true,
    "an active drag must not be interrupted by hover dismissal",
  );
  await pill.mouse.up();
  await menu.waitFor({ state: "hidden" });
  await hoverMore();
  await leaveMore();
  await hoverMore();
  check(
    "Pinning and sorting do not leave the menu permanently open; an active drag stays open and an outside drop closes it",
  );
  await rows
    .filter({ has: pill.locator('[aria-label="调整顺序 翻译"]') })
    .getByRole("button", { name: "翻译", exact: true })
    .click();
  await until(
    () => app.windows().some((w) => w.url().includes("mode=panel")),
    "result window",
  );
  const panel = app.windows().find((w) => w.url().includes("mode=panel"));
  const session = await panel.evaluate(() =>
    window.readfinch.call("interactionGet"),
  );
  assert.equal(session.text, "A selected sentence.");
  assert.equal(session.actionId, "translate");
  check(
    "More opens in the selection toolbar, preserves the selection, and pins and ordering update the strip",
  );
  await select();
  await shot("toolbar-dark");
  await hoverMore();
  await button(pill, "添加自定义 AI 指令").click();
  await main
    .getByRole("heading", { name: "自定义 AI 指令", exact: true })
    .waitFor();
  await main
    .getByRole("dialog", { name: "添加指令" })
    .getByRole("button", { name: "空白", exact: true })
    .click();
  await until(
    async () => (await state()).config.actions.some((a) => a.name === "新指令"),
    "toolbar creates inline command",
  );
  await select();
  await disable();
  for (const theme of ["light", "dark"]) {
    await call("setTheme", { theme });
    await pill.waitForFunction(
      (v) => document.documentElement.dataset.theme === v,
      theme,
    );
    await shot("toolbar-disable-" + theme);
  }
  await button(pill, "在当前应用中禁用").click();
  await until(async () => !(await visible()), "hide app");
  await select("READER");
  assert.equal(await visible(), false);
  await select("Reader Pro");
  await until(visible, "different app");
  await disable();
  await pill
    .locator(".disable-menu")
    .getByRole("button", { name: "设置", exact: true })
    .click();
  await button(main, "重新启用 Reader").click();
  await until(
    async () => !(await state()).config.selection.disabledToolbarApps.length,
    "reenable reader",
  );
  await select("Reader");
  await disable();
  await button(pill, "全局禁用").click();
  await until(
    async () => !(await state()).config.selection.automatic,
    "global disable",
  );
  await select("Another app");
  assert.equal(await visible(), false);
  await main
    .getByRole("switch", { name: "自动显示划词工具栏", exact: true })
    .click();
  await until(
    async () => (await state()).config.selection.automatic,
    "resume globally",
  );
  await select();
  await disable();
  await button(pill, "禁用 1 小时").click();
  await until(
    async () => (await state()).toolbarPausedUntil > Date.now() + 3500000,
    "timed pause",
  );
  const paused = (await state()).toolbarPausedUntil;
  await app.close();
  app = null;
  await launch();
  assert.equal((await state()).toolbarPausedUntil, paused);
  await select();
  assert.equal(await visible(), false);
  await button(main, "立即恢复").click();
  await until(
    async () => (await state()).toolbarPausedUntil === 0,
    "resume temporary pause",
  );
  await select();
  await until(visible, "toolbar resumed");
  check(
    "New action editor, per-app and global disable, and a one-hour pause that survives restart and can be resumed from Settings",
  );
  await writeFile(
    process.argv.includes("--verify-only")
      ? path.join(dir, "report.json")
      : "docs/toolbar-verification.json",
    JSON.stringify(
      {
        checks,
        scope:
          "Real Electron windows with development selection events and an isolated profile",
      },
      null,
      2,
    ),
  );
} finally {
  await app?.close();
}
