import { besideCursor, type Point, type Bounds } from "./placement";
import type { ToolbarMenu, ToolbarRect } from "../shared/toolbar";

export function toolbarAnchor(
  cursor: Point,
  selection: Point,
  display: Bounds,
  preferSelection = false,
) {
  const contains = (p: Point) =>
    p.x >= display.x &&
    p.x < display.x + display.width &&
    p.y >= display.y &&
    p.y < display.y + display.height;
  return contains(selection) && (preferSelection || !contains(cursor))
    ? selection
    : cursor;
}

// Keep the icon strip anchored while opening a menu. Only the enclosing native
// window grows, including room for its close button and the two surfaces' shadows.
export function toolbarPlacement(
  anchor: Point,
  area: Bounds,
  pinned: number,
  total: number,
  mode: ToolbarMenu,
) {
  const inset = 8;
  const start = besideCursor(
    anchor,
    { width: pinned * 32 + 39 + inset * 2, height: 32 + inset * 2 },
    area,
  );
  const bar: ToolbarRect = {
    x: start.x + inset,
    y: start.y + inset,
    width: start.width - inset * 2,
    height: 32,
  };
  let popup: ToolbarRect | undefined;
  if (mode !== "none") {
    const width = Math.min(mode === "more" ? 224 : 176, area.width - 32);
    const desired = mode === "more" ? Math.min(total, 5) * 32 + 48 : 145;
    const below = area.y + area.height - (bar.y + bar.height) - 20;
    const above = bar.y - area.y - 20;
    const up =
      mode === "disable"
        ? above >= desired || (below < desired && above > below)
        : below < desired && above > below;
    const height = Math.min(desired, Math.max(48, up ? above : below));
    const x = Math.max(
      area.x + 16,
      Math.min(bar.x + bar.width - width, area.x + area.width - width - 16),
    );
    popup = {
      x,
      y: up ? bar.y - height - 4 : bar.y + bar.height + 4,
      width,
      height,
    };
  }
  const x = Math.min(bar.x, popup?.x ?? bar.x) - inset;
  const y = Math.min(bar.y, popup?.y ?? bar.y) - inset;
  const right = Math.max(
    bar.x + bar.width,
    popup ? popup.x + popup.width : -Infinity,
  );
  const bottom = Math.max(
    bar.y + bar.height,
    popup ? popup.y + popup.height : -Infinity,
  );
  const relative = (r: ToolbarRect) => ({ ...r, x: r.x - x, y: r.y - y });
  return {
    bounds: { x, y, width: right - x + inset, height: bottom - y + inset },
    bar: relative(bar),
    popup: popup && relative(popup),
  };
}

/** On shaped-window platforms the native window never moves when a menu opens.
 * Only the painted surfaces receive pointer events; the rest belongs to the source app. */
export function toolbarWindowLayout(
  anchor: Point,
  area: Bounds,
  pinned: number,
  total: number,
  mode: ToolbarMenu,
  shaped: boolean,
) {
  const current = toolbarPlacement(anchor, area, pinned, total, mode);
  if (!shaped) return { ...current, shape: undefined };
  const envelopes = (["more", "disable"] as const).map(
    (m) => toolbarPlacement(anchor, area, pinned, total, m).bounds,
  );
  const x = Math.min(...envelopes.map((r) => r.x));
  const y = Math.min(...envelopes.map((r) => r.y));
  const bounds = {
    x,
    y,
    width: Math.max(...envelopes.map((r) => r.x + r.width)) - x,
    height: Math.max(...envelopes.map((r) => r.y + r.height)) - y,
  };
  const shift = (r: ToolbarRect) => ({
    ...r,
    x: r.x + current.bounds.x - x,
    y: r.y + current.bounds.y - y,
  });
  const bar = shift(current.bar),
    popup = current.popup && shift(current.popup);
  const shape = [bar, ...(popup ? [popup] : [])].map((r) => ({
    x: r.x - 8,
    y: r.y - 8,
    width: r.width + 16,
    height: r.height + 16,
  }));
  return { bounds, bar, popup, shape };
}
