import { assetFootprint, resolveAsset } from "../asset/resolve.ts";
import type { Vec2 } from "../math.ts";
import type { Asset } from "../schemas/asset.ts";
import type { DocumentContent } from "../schemas/document.ts";
import { dot, obbAxes, wallObb, type Obb } from "./obb.ts";
import { itemObb } from "./footprint.ts";
import { wallLength } from "./polygon.ts";

export type ClearanceSide = "front" | "back" | "left" | "right";

export interface ItemClearance {
  side: ClearanceSide;
  distance: number;
  from: Vec2;
  to: Vec2;
  wallId: string;
}

export const MAX_CLEARANCE_DISTANCE = 20;

// Axis index 0 = local x, 1 = local z; sign picks the outward direction of the side.
const SIDES: { side: ClearanceSide; axisIndex: 0 | 1; sign: 1 | -1 }[] = [
  { side: "front", axisIndex: 1, sign: 1 },
  { side: "back", axisIndex: 1, sign: -1 },
  { side: "right", axisIndex: 0, sign: 1 },
  { side: "left", axisIndex: 0, sign: -1 },
];

// Slab test in the box frame: distance along the ray to the entry face, or null on a miss.
function rayEntryDistance(origin: Vec2, direction: Vec2, box: Obb): number | null {
  const [axisX, axisZ] = obbAxes(box);
  const offset: Vec2 = [origin[0] - box.cx, origin[1] - box.cz];
  let near = 0;
  let far = Infinity;
  for (const [axis, half] of [[axisX, box.hx], [axisZ, box.hz]] as const) {
    const position = dot(offset, axis);
    const speed = dot(direction, axis);
    if (Math.abs(speed) < 1e-12) {
      if (Math.abs(position) > half) return null;
      continue;
    }
    const first = (-half - position) / speed;
    const second = (half - position) / speed;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
  }
  return near <= far ? near : null;
}

function nearestWallHit(origin: Vec2, direction: Vec2, walls: DocumentContent["apartment"]["walls"]): { wallId: string; distance: number } | null {
  let nearest: { wallId: string; distance: number } | null = null;
  for (const wall of walls) {
    if (wallLength(wall) === 0) continue;
    const distance = rayEntryDistance(origin, direction, wallObb(wall));
    if (distance === null || distance > MAX_CLEARANCE_DISTANCE) continue;
    if (nearest === null || distance < nearest.distance) nearest = { wallId: wall.id, distance };
  }
  return nearest;
}

/** Distances from the midpoint of each item side to the first wall face along its outward normal (walls only, openings ignored). */
export function itemClearances(content: DocumentContent, assets: Asset[], itemId: string): ItemClearance[] {
  const item = content.items.find((candidate) => candidate.id === itemId);
  const asset = item && assets.find((candidate) => candidate.id === item.assetId);
  if (!item || !asset) return [];

  const box = itemObb(item, assetFootprint(resolveAsset(asset, item.params)));
  const axes = obbAxes(box);
  const halves: [number, number] = [box.hx, box.hz];
  const clearances: ItemClearance[] = [];

  for (const { side, axisIndex, sign } of SIDES) {
    const axis = axes[axisIndex];
    const direction: Vec2 = [axis[0] * sign, axis[1] * sign];
    const half = halves[axisIndex];
    const from: Vec2 = [box.cx + direction[0] * half, box.cz + direction[1] * half];
    const hit = nearestWallHit(from, direction, content.apartment.walls);
    if (hit) {
      clearances.push({ side, distance: hit.distance, from, to: [from[0] + direction[0] * hit.distance, from[1] + direction[1] * hit.distance], wallId: hit.wallId });
    }
  }
  return clearances;
}
