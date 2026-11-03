const { app, BrowserWindow } = require("electron");

// A separate desktop process, including a cross-site embedded document. The
// test changes only this fixture's DOM; native selection still comes from UIA.
app.commandLine.appendSwitch("site-per-process");
app.setName("ReadFinch Selection Fixture");
app.whenReady().then(async () => {
  app.setAccessibilitySupportEnabled(true);
  const window = new BrowserWindow({
    width: 900,
    height: 720,
    x: 80,
    y: 80,
    title: "ReadFinch Selection Fixture",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  window.setMenuBarVisibility(false);
  const url = process.argv.find((arg) => arg.startsWith("--fixture-url="));
  await window.loadURL(url.slice("--fixture-url=".length));
  window.show();
  window.focus();
});
app.on("window-all-closed", () => app.quit());
