export type Point = { x: number; y: number };
export type Bounds = Point & { width: number; height: number };
// Coordinates are Electron screen DIPs throughout; do not convert them twice.
export function besideCursor(
  anchor: Point,
  size: { width: number; height: number },
  area: Bounds,
) {
  const margin = 8;
  const width = Math.min(size.width, Math.max(1, area.width - margin * 2));
  const height = Math.min(size.height, Math.max(1, area.height - margin * 2));
  const x = Math.max(
    area.x + margin,
    Math.min(anchor.x + 10, area.x + area.width - width - margin),
  );
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
