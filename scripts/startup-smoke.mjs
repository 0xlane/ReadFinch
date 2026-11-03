import { _electron as electron } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

if (process.platform !== "win32") {
  console.log("Windows tray smoke test.");
  process.exit(0);
}
const packaged = process.argv.includes("--packaged");
const dataDir = path.resolve(".local", "startup-" + Date.now());
await mkdir(dataDir, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({
  ...(packaged
    ? { executablePath: path.resolve("release/win-unpacked/ReadFinch.exe") }
    : {}),
  args: [...(packaged ? [] : ["."]), "--autostart", "--data-dir=" + dataDir],
  env,
});
try {
  const page = await application.firstWindow();
  await page.waitForLoadState();
  await page.evaluate(() => window.texthop.call("snapshot"));
  assert.equal(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) => w.isVisible()),
    ),
    false,
  );
  // Exercise the real menu handlers with an in-memory stand-in for OS registration.
  // Never change the developer's login items during a UI test.
  await application.evaluate(({ app, Menu }) => {
    const read = app.getLoginItemSettings,
      write = app.setLoginItemSettings,
      build = Menu.buildFromTemplate;
    const previousPortable = process.env.PORTABLE_EXECUTABLE_FILE;
    if (app.isPackaged)
      process.env.PORTABLE_EXECUTABLE_FILE =
        "C:\\Test Folder\\TextHop portable.exe";
    const fixture = (globalThis.startupFixture = {
      calls: [],
      active: false,
      restore() {
        app.getLoginItemSettings = read;
        app.setLoginItemSettings = write;
        Menu.buildFromTemplate = build;
        if (previousPortable === undefined)
          delete process.env.PORTABLE_EXECUTABLE_FILE;
        else process.env.PORTABLE_EXECUTABLE_FILE = previousPortable;
      },
    });
    app.getLoginItemSettings = () => ({
      openAtLogin: fixture.active,
      launchItems: fixture.calls.length
        ? [
            {
              name: fixture.calls.at(-1).name,
              scope: "user",
              enabled: fixture.active,
            },
          ]
        : [],
    });
    app.setLoginItemSettings = (settings) => {
      fixture.calls.push(settings);
      fixture.active = settings.openAtLogin;
    };
    Menu.buildFromTemplate = function (template) {
      const menu = build.call(this, template),
        item = template.find((i) => i.id === "launch-at-login");
      if (item) {
        fixture.menu = menu;
        fixture.handler = item.click;
      }
      return menu;
    };
  });
  await page.evaluate(() =>
    window.texthop.call("setTheme", { theme: "light" }),
  );
  const checked = () =>
    application.evaluate(
      () => startupFixture.menu.getMenuItemById("launch-at-login").checked,
    );
  const toggle = (value) =>
    application.evaluate(
      (_, value) => startupFixture.handler({ checked: value }),
      value,
    );
  assert.equal(await checked(), false);
  assert.equal(
    await application.evaluate(() => startupFixture.calls.length),
    0,
  );
  await toggle(true);
  assert.equal(await checked(), true);
  const registration = await application.evaluate(() =>
    startupFixture.calls.at(-1),
  );
  if (process.platform === "win32") {
    assert.equal(registration.args.at(-1), "--autostart");
    if (packaged)
      assert.equal(registration.path, "C:\\Test Folder\\TextHop portable.exe");
  }
  await application.evaluate(() => {
    startupFixture.active = false;
    startupFixture.menu.emit("menu-will-show");
  });
  assert.equal(await checked(), false);
  await toggle(true);
  await toggle(false);
  assert.equal(await checked(), false);
  await application.evaluate(() => startupFixture.restore());
  await page.evaluate(() =>
    window.texthop.call("settingsOpen", { tab: "general" }),
  );
  assert.ok(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) => w.isVisible()),
    ),
  );
  await page.evaluate(async () => {
    const state = await window.texthop.call("snapshot");
    if (state.config.cache.minutes !== 30)
      throw Error("Unexpected cache default");
    state.config.cache.minutes = 17;
    await window.texthop.call("saveConfig", {
      config: state.config,
      revision: state.revision,
    });
  });
  const duration = page.locator(".cache-settings select");
  await duration.locator('option[value="17"]').waitFor({ state: "attached" });
  assert.equal(
    await duration
      .locator('option[value="17"]')
      .evaluate((option) => option.disabled),
    true,
  );
  await duration.selectOption("360");
  await page.waitForFunction(
    async () =>
      (await window.texthop.call("snapshot")).config.cache.minutes === 360,
  );
  assert.equal(await duration.locator('option[value="17"]').count(), 0);
  const screenshots = path.resolve("docs/screenshots/v0.9");
  await mkdir(screenshots, { recursive: true });
  await page
    .locator(".cache-settings")
    .screenshot({ path: path.join(screenshots, "cache-settings.png") });
  console.log(
    "A legacy 17-minute cache remains effective until the user selects an autosaved preset.",
  );
  console.log(
    "First login launch stays in the tray; explicit open works. Tray registration, external disable, and removal verified with isolated OS fixtures.",
  );
} finally {
  await application.close();
}
