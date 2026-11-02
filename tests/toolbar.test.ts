import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig } from "../src/shared/config";
import {
  toolbarEnabled,
  toolbarItems,
  editToolbar,
} from "../src/shared/toolbar";
import { toolbarPlacement } from "../src/core/toolbar-placement";
test("menu expansion stays on the monitor and keeps the toolbar anchored", () => {
  for (const x of [-1920, 0, 1920]) {
    const area = { x, y: -200, width: 1024, height: 768 };
    for (const anchor of [
      { x, y: -200 },
      { x: x + 1020, y: 560 },
    ]) {
      const base = toolbarPlacement(anchor, area, 6, 11, "none");
      for (const mode of ["disable", "more"] as const) {
        const { bounds, bar, popup } = toolbarPlacement(
          anchor,
          area,
          6,
          11,
          mode,
        );
        assert.ok(popup);
        assert.equal(bounds.x + bar.x, base.bounds.x + base.bar.x);
        assert.equal(bounds.y + bar.y, base.bounds.y + base.bar.y);
        assert.ok(
          bounds.x >= x &&
            bounds.x + bounds.width <= x + 1024 &&
            bounds.y >= area.y &&
            bounds.y + bounds.height <= 568,
        );
      }
    }
  }
});
test("toolbar moves and pins include local speech and preserve disabled actions", () => {
  let c = defaultConfig();
  c.actions[2].enabled = false;
  c = editToolbar(c, {
    type: "move",
    token: "t",
    key: "speech",
    over: "action:dictionary",
  });
  assert.deepEqual(
    toolbarItems(c)
      .slice(0, 3)
      .map((x) => x.key),
    ["action:translate", "action:dictionary", "speech"],
  );
  assert.equal(c.actions[2].id, "sentence");
  c = editToolbar(c, { type: "pin", token: "t", key: "speech", pinned: false });
  assert.equal(c.selection.speechPinned, false);
  c.selection.disabledToolbarApps = ["editor"];
  assert.equal(toolbarEnabled(c, "Editor", 0), false);
  assert.equal(toolbarEnabled(c, "Editor2", 999, 998), false);
  assert.equal(toolbarEnabled(c, "Editor2", 999, 999), true);
});
