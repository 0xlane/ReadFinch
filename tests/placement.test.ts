import test from "node:test";
import assert from "node:assert/strict";
import { besideCursor, planPanel, panelBounds } from "../src/core/placement";

test("floating windows stay inside negative-coordinate and small display work areas", () => {
  const areas = [
    { x: 0, y: 0, width: 1536, height: 824 },
    { x: -1280, y: -300, width: 1280, height: 984 },
    { x: 1536, y: 0, width: 640, height: 480 },
  ];
  for (const area of areas)
    for (const size of [
      { width: 40, height: 40 },
      { width: 440, height: 680 },
    ]) {
      for (const anchor of [
        { x: area.x, y: area.y },
        { x: area.x + area.width - 1, y: area.y + area.height - 1 },
      ]) {
        const bounds = besideCursor(anchor, size, area);
        assert.ok(bounds.x >= area.x + 8 && bounds.y >= area.y + 8);
        assert.ok(bounds.x + bounds.width <= area.x + area.width - 8);
        assert.ok(bounds.y + bounds.height <= area.y + area.height - 8);
      }
    }
});
test("a popup opens next to the cursor and flips above it near the bottom", () => {
  const area = { x: 0, y: 0, width: 1280, height: 800 };
  assert.deepEqual(
    besideCursor({ x: 250, y: 200 }, { width: 440, height: 320 }, area),
    { x: 260, y: 216, width: 440, height: 320 },
  );
  assert.equal(
    besideCursor({ x: 250, y: 750 }, { width: 440, height: 320 }, area).y,
    420,
  );
});

test("the toolbar clears the pointer at the inner edge of a left-hand monitor", () => {
  const area = { x: -1440, y: -200, width: 1440, height: 900 };
  const size = { width: 215, height: 48 };
  assert.deepEqual(besideCursor({ x: -3, y: 686 }, size, area), {
    x: -228,
    y: 628,
    ...size,
  });
  assert.equal(
    besideCursor({ x: -10, y: 0 }, size, { ...area, x: -160, width: 160 }).x,
    -152,
  );
});

test("a result chooses the roomier side once and keeps its pointer-facing edge when late suggestions arrive", () => {
  const area = { x: 0, y: 0, width: 1280, height: 800 };
  for (const [y, side] of [
    [100, "below"],
    [750, "above"],
  ] as const) {
    const plan = planPanel({ x: 260, y }, area);
    assert.equal(plan.side, side);
    const first = panelBounds(plan, 220);
    for (const height of [250, 380, 540, 720, 3000, 220]) {
      const next = panelBounds(plan, height);
      assert.equal(next.x, first.x);
      assert.equal(
        side === "below" ? next.y : next.y + next.height,
        side === "below" ? y + 12 : y - 12,
      );
      assert.ok(next.y + next.height <= 792);
    }
  }
});

test("stable result plans clamp to small, offset and fractional-DIP work areas", () => {
  for (const area of [
    { x: -1536, y: -220, width: 1536, height: 864 },
    { x: 1536, y: 0, width: 640, height: 360 },
    { x: 0, y: 0, width: 768, height: 512 },
  ]) {
    for (const portion of [0, 0.25, 0.5, 0.75, 1]) {
      const plan = planPanel(
        {
          x: area.x + area.width * portion + 0.4,
          y: area.y + area.height * portion + 0.3,
        },
        area,
      );
      const bounds = panelBounds(plan, 3000);
      assert.ok(bounds.x >= area.x + 8 && bounds.y >= area.y + 8);
      assert.ok(bounds.x + bounds.width <= area.x + area.width - 8);
      assert.ok(bounds.y + bounds.height <= area.y + area.height - 8);
      assert.ok(bounds.height <= 680);
      assert.equal(bounds.x, Math.round(bounds.x));
      assert.equal(bounds.y, Math.round(bounds.y));
    }
  }
});
