import type { BrowserWindow } from "electron";
import { createRequire } from "node:module";
import path from "node:path";

type PanelBridge = {
  configure(handle: Buffer): boolean;
  makeKeyWindow(handle: Buffer): boolean;
};

export class MacPanels {
  private bridge?: PanelBridge;
  private prepared = new WeakSet<BrowserWindow>();
  constructor(private nativeRoot: string) {}

  prepare(win: BrowserWindow) {
    if (process.platform !== "darwin") return;
    try {
      this.bridge ??= createRequire(__filename)(
        path.join(this.nativeRoot, "bin", "readfinch-panel.node"),
      );
      if (!this.bridge!.configure(win.getNativeWindowHandle()))
        throw Error("Non-activating window support is unavailable");
      this.prepared.add(win);
    } catch (error) {
      // Preserve usable windows on unsupported future runtimes. Native desktop
      // regression checks must verify this integration before shipping an update.
      console.warn("macOS panel integration: " + (error as Error).message);
    }
  }

  show(win: BrowserWindow) {
    if (this.prepared.has(win)) {
      win.showInactive();
      this.bridge!.makeKeyWindow(win.getNativeWindowHandle());
      win.webContents.focus();
    } else {
      win.show();
      win.focus();
    }
  }
}
