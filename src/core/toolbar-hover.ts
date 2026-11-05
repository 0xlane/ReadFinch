import type { Point, Bounds } from "./placement";
import type { ToolbarMenu, ToolbarRect } from "../shared/toolbar";

type Layout = { bounds: Bounds; bar: ToolbarRect; popup?: ToolbarRect };
export function toolbarHoverRegions(layout: Layout) {
  const bar = {
    ...layout.bar,
    x: layout.bounds.x + layout.bar.x,
    y: layout.bounds.y + layout.bar.y,
  };
  const popup = layout.popup && {
    ...layout.popup,
    x: layout.bounds.x + layout.popup.x,
    y: layout.bounds.y + layout.popup.y,
  };
  // Match toolbar.css: one border + two padding pixels, 32 x 26 buttons.
  const more = {
    x: bar.x + bar.width - 35,
    y: bar.y + 3,
    width: 32,
    height: 26,
  };
  const close = {
    x: bar.x + bar.width - 6,
    y: bar.y - 7,
    width: 15,
    height: 15,
  };
  const bridge = popup && {
    x: Math.max(bar.x, popup.x),
    y: popup.y < bar.y ? popup.y + popup.height : bar.y + bar.height,
    width: Math.max(
      0,
      Math.min(bar.x + bar.width, popup.x + popup.width) -
        Math.max(bar.x, popup.x),
    ),
    height: 4,
  };
  return { more, close, popup, bridge };
}
const contains = (rect: ToolbarRect | undefined, point: Point) =>
  !!rect &&
  point.x >= rect.x &&
  point.x < rect.x + rect.width &&
  point.y >= rect.y &&
  point.y < rect.y + rect.height;

// Native window resizing can synthesize DOM leave/enter events without mouse
// movement. Only screen-coordinate movement changes the hover intent.
export class ToolbarHover {
  private last?: Point;
  private pending?: { mode: "more" | "none"; since: number };
  private suppressed = false;
  private dragging = false;
  reset() {
    this.last = undefined;
    this.pending = undefined;
    this.suppressed = false;
    this.dragging = false;
  }
  rebase(point: Point, regions?: ReturnType<typeof toolbarHoverRegions>) {
    if (
      regions &&
      !contains(regions.more, point) &&
      !contains(regions.popup, point) &&
      !contains(regions.bridge, point)
    )
      return;
    this.last = { ...point };
    this.pending = undefined;
  }
  explicit(mode: ToolbarMenu, point: Point) {
    this.rebase(point);
    this.suppressed = mode === "none";
    if (mode !== "more") this.dragging = false;
  }
  drag(active: boolean) {
    this.dragging = active;
    this.pending = undefined;
    this.last = undefined;
  }
  update(
    point: Point,
    regions: ReturnType<typeof toolbarHoverRegions>,
    mode: ToolbarMenu,
    now: number,
  ): "more" | "none" | undefined {
    const overMore =
      contains(regions.more, point) && !contains(regions.close, point);
    if (!overMore) this.suppressed = false;
    const moved =
      !this.last || this.last.x !== point.x || this.last.y !== point.y;
    this.last = { ...point };
    if (this.dragging || mode === "disable") {
      this.pending = undefined;
      return;
    }
    if (!moved && !this.pending) return;
    const next =
      mode === "none"
        ? overMore && !this.suppressed
          ? "more"
          : undefined
        : overMore ||
            contains(regions.popup, point) ||
            contains(regions.bridge, point)
          ? undefined
          : "none";
    if (!next) {
      this.pending = undefined;
      return;
    }
    if (this.pending?.mode !== next) {
      this.pending = { mode: next, since: now };
      return;
    }
    if (now - this.pending.since >= (next === "more" ? 100 : 200)) {
      this.pending = undefined;
      return next;
    }
  }
}
