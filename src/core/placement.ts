export type Point = { x: number; y: number };
export type Bounds = Point & { width: number; height: number };
export type PanelPlacement = Point & {
  width: number;
  maxHeight: number;
  side: "above" | "below";
};

// Keep the edge nearest the pointer fixed as content grows. Reserving a tall
// invisible box above the pointer leaves short results hundreds of pixels away.
export function planPanel(anchor: Point, area: Bounds): PanelPlacement {
  const margin = 8,
    gap = 12;
  const top = Math.ceil(area.y + margin),
    bottom = Math.floor(area.y + area.height - margin);
  const width = Math.min(500, Math.max(1, Math.floor(area.width - margin * 2)));
  const x = Math.round(
    Math.max(
      area.x + margin,
      Math.min(anchor.x + 10, area.x + area.width - width - margin),
    ),
  );
  const below = bottom - anchor.y - gap,
    above = anchor.y - gap - top;
  const side = below >= above ? "below" : "above";
  const y = Math.round(
    Math.max(
      top,
      Math.min(bottom, side === "below" ? anchor.y + gap : anchor.y - gap),
    ),
  );
  return {
    x,
    y,
    width,
    side,
    maxHeight: Math.max(
      1,
      Math.min(680, side === "below" ? bottom - y : y - top),
    ),
  };
}

export function panelBounds(
  plan: PanelPlacement,
  requestedHeight: number,
): Bounds {
  const height = Math.round(
    Math.max(1, Math.min(requestedHeight, plan.maxHeight)),
  );
  return {
    x: plan.x,
    y: plan.side === "above" ? plan.y - height : plan.y,
    width: plan.width,
    height,
  };
}
// Coordinates are Electron screen DIPs throughout; do not convert them twice.
export function besideCursor(
  anchor: Point,
  size: { width: number; height: number },
  area: Bounds,
) {
  const margin = 8;
  const width = Math.min(size.width, Math.max(1, area.width - margin * 2));
  const height = Math.min(size.height, Math.max(1, area.height - margin * 2));
  const left = area.x + margin;
  const right = area.x + area.width - margin;
  const beside =
    anchor.x + 10 + width <= right ? anchor.x + 10 : anchor.x - 10 - width;
  const x = Math.max(left, Math.min(beside, right - width));
  let y = anchor.y + 16;
  if (y + height > area.y + area.height - margin) y = anchor.y - height - 10;
  y = Math.max(
    area.y + margin,
    Math.min(y, area.y + area.height - height - margin),
  );
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}
