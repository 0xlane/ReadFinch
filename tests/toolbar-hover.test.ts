import test from "node:test";
import assert from "node:assert/strict";
import { ToolbarHover, toolbarHoverRegions } from "../src/core/toolbar-hover";
import { toolbarWindowLayout } from "../src/core/toolbar-placement";

const area = { x: -1440, y: -200, width: 1440, height: 900 };
const layout = (y: number, mode: "none" | "more") =>
  toolbarHoverRegions(
    toolbarWindowLayout({ x: -600, y }, area, 3, 7, mode, false),
  );
const middle = (r: {
  x: number;
  y: number;
  width: number;
  height: number;
}) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

test("stationary screen hover opens once across both upward and downward native resizes", () => {
  for (const y of [-100, 640]) {
    const closed = layout(y, "none"),
      open = layout(y, "more"),
      point = middle(closed.more),
      hover = new ToolbarHover();
    assert.deepEqual(closed.more, open.more);
    assert.equal(hover.update(point, closed, "none", 0), undefined);
    assert.equal(hover.update(point, closed, "none", 99), undefined);
    assert.equal(hover.update(point, closed, "none", 100), "more");
    for (let time = 125; time <= 2000; time += 25)
      assert.equal(hover.update(point, open, "more", time), undefined);
  }
});

test("click close stays closed through stationary and jitter events until a genuine exit and return", () => {
  const regions = layout(100, "none"),
    p = middle(regions.more),
    hover = new ToolbarHover();
  hover.explicit("none", p);
  for (let time = 0; time < 1000; time += 25)
    assert.equal(
      hover.update({ ...p, x: p.x + (time % 2) }, regions, "none", time),
      undefined,
    );
  hover.update({ x: p.x - 50, y: p.y }, regions, "none", 1100);
  assert.equal(hover.update(p, regions, "none", 1150), undefined);
  assert.equal(hover.update(p, regions, "none", 1250), "more");
});

test("the connecting gap and menu retain hover; leaving closes after 200ms", () => {
  const regions = layout(100, "more"),
    hover = new ToolbarHover(),
    p = middle(regions.more);
  hover.explicit("more", p);
  for (const r of [regions.bridge!, regions.popup!])
    assert.equal(hover.update(middle(r), regions, "more", 100), undefined);
  const outside = { x: p.x + 60, y: p.y - 50 };
  assert.equal(hover.update(outside, regions, "more", 200), undefined);
  assert.equal(hover.update(outside, regions, "more", 399), undefined);
  assert.equal(hover.update(outside, regions, "more", 400), "none");
});

test("layout updates without pointer motion do not close editing menus; movement resumes dismissal", () => {
  const regions = layout(100, "more"),
    p = middle(regions.popup!),
    hover = new ToolbarHover();
  hover.explicit("more", p);
  const shifted = {
    ...regions,
    popup: { ...regions.popup!, x: regions.popup!.x + 400 },
  };
  assert.equal(hover.update(p, shifted, "more", 1000), undefined);
  const outside = { x: p.x - 1, y: p.y };
  hover.update(outside, shifted, "more", 1100);
  assert.equal(hover.update(outside, shifted, "more", 1300), "none");
});

test("dragging pauses closure, an outside drop resumes it, and reset clears prior interaction", () => {
  const regions = layout(100, "more"),
    p = { x: -1000, y: 600 },
    hover = new ToolbarHover();
  hover.drag(true);
  assert.equal(hover.update(p, regions, "more", 0), undefined);
  assert.equal(hover.update(p, regions, "more", 1000), undefined);
  hover.drag(false);
  hover.update(p, regions, "more", 1100);
  assert.equal(hover.update(p, regions, "more", 1300), "none");
  hover.explicit("none", middle(regions.more));
  hover.reset();
  hover.update(middle(regions.more), regions, "none", 2000);
  assert.equal(
    hover.update(middle(regions.more), regions, "none", 2100),
    "more",
  );
});

test("independent menu surfaces never alter the strip frame or its local coordinates", async () => {
  const { toolbarSurfaces } = await import("../src/core/toolbar-placement");
  for (const anchor of [
    { x: -1420, y: -180 },
    { x: -600, y: 100 },
    { x: -20, y: 650 },
  ]) {
    const surfaces = (["none", "more", "disable"] as const).map((mode) =>
      toolbarSurfaces(toolbarWindowLayout(anchor, area, 4, 7, mode, false)),
    );
    for (const surface of surfaces.slice(1))
      assert.deepEqual(surface.bar, surfaces[0].bar);
    assert.equal(surfaces[0].menu, undefined);
    for (const surface of surfaces.slice(1)) {
      assert.ok(surface.menu);
      assert.equal(surface.menu.popup.x, 8);
      assert.equal(surface.menu.popup.y, 8);
      assert.ok(
        surface.menu.bounds.x >= area.x && surface.menu.bounds.y >= area.y,
      );
      assert.ok(
        surface.menu.bounds.x + surface.menu.bounds.width <=
          area.x + area.width,
      );
      assert.ok(
        surface.menu.bounds.y + surface.menu.bounds.height <=
          area.y + area.height,
      );
    }
  }
});

test("a config update cannot cancel dismissal after the pointer has already left", () => {
  const regions = layout(100, "more"),
    hover = new ToolbarHover();
  hover.explicit("more", middle(regions.popup!));
  const outside = { x: -1000, y: 600 };
  hover.update(outside, regions, "more", 0);
  hover.rebase(outside, regions);
  assert.equal(hover.update(outside, regions, "more", 200), "none");
});
