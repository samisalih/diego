import type { Item, ItemPatch } from "@app/core";

export const SNAP_STEP_FINE_M = 0.01;
export const SNAP_STEP_COARSE_M = 0.1;
export const CLICK_THRESHOLD_M = 0.005;

export type FloorPoint = [x: number, z: number];

/** Where a ray (origin, direction) meets the floor plane y = 0; null when it is parallel to it or points away. */
export function floorPointFromRay(origin: [number, number, number], direction: [number, number, number]): FloorPoint | null {
  const [originX, originY, originZ] = origin;
  const [directionX, directionY, directionZ] = direction;
  if (directionY === 0) return null;
  const distance = -originY / directionY;
  if (distance < 0) return null;
  return [originX + directionX * distance, originZ + directionZ * distance];
}

/** Raw pointer movement on the floor between two points. */
export function dragDelta(start: FloorPoint, current: FloorPoint): FloorPoint {
  return [current[0] - start[0], current[1] - start[1]];
}

/** Shift snaps to the coarse grid. */
export function snapStepFor(shiftKey: boolean): number {
  return shiftKey ? SNAP_STEP_COARSE_M : SNAP_STEP_FINE_M;
}

/** A movement shorter than the threshold is a click, not a drag. */
export function isClick(delta: FloorPoint): boolean {
  return Math.hypot(delta[0], delta[1]) < CLICK_THRESHOLD_M;
}

/** Snaps to the grid and rounds to the grid's decimals, so 257 * 0.01 gives 2.57 and never 2.5700000000000003; no negative zero. */
function snap(value: number, step: number): number {
  const decimals = Math.max(0, Math.round(-Math.log10(step)));
  return Number((Math.round(value / step) * step).toFixed(decimals)) || 0;
}

/** Position patches for the selected, unlocked items; the resulting position is snapped, not the delta. */
export function dragPatches(items: Item[], selectedIds: string[], delta: FloorPoint, snapStep: number): ItemPatch[] {
  return items
    .filter((item) => selectedIds.includes(item.id) && !item.locked)
    .map((item) => ({ id: item.id, x: snap(item.x + delta[0], snapStep), z: snap(item.z + delta[1], snapStep) }));
}
