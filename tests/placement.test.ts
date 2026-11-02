import test from "node:test";
import assert from "node:assert/strict";
import { besideCursor } from "../src/core/placement";

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
