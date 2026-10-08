import type { AssetFootprint } from "../asset/resolve.ts";
import type { Item } from "../schemas/item.ts";
import type { Obb } from "./obb.ts";

const DEGREES_TO_RADIANS = Math.PI / 180;

export function itemObb(item: Item, footprint: AssetFootprint): Obb {
  const angle = item.rotation * DEGREES_TO_RADIANS;
  const { centerX, centerZ } = footprint;
  return {
    cx: item.x + centerX * Math.cos(angle) + centerZ * Math.sin(angle),
    cz: item.z - centerX * Math.sin(angle) + centerZ * Math.cos(angle),
    hx: footprint.halfWidth,
    hz: footprint.halfDepth,
    angle,
  };
}
