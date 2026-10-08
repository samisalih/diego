import { DEGREES_TO_RADIANS, resolveAsset, type Asset, type Item, type PartShape, type ResolvedPart, type Vec3 } from "@app/core";
import { buildPartGeometryKey } from "./parts.ts";

/** One mesh of an item in asset space; the caller places the item group at (item.x, 0, item.z) with y-rotation item.rotation. */
export type ItemPart = {
  partId: string;
  shape: PartShape;
  /** Equal keys mean equal geometry, so meshes can share one cached BufferGeometry. */
  geometryKey: string;
  position: Vec3;
  /** Euler angles in radians, order XYZ. */
  rotation: Vec3;
  materialId: string | null;
  /** The resolved part, to build the geometry on a cache miss with `buildPartGeometry`. */
  resolved: ResolvedPart;
};

const reportedMissingAssetIds = new Set<string>();

function reportMissingAssetOnce(assetId: string): void {
  if (reportedMissingAssetIds.has(assetId)) return;
  reportedMissingAssetIds.add(assetId);
  console.warn(`Asset "${assetId}" is missing; its items are not rendered`);
}

function toItemPart(part: ResolvedPart): ItemPart {
  return {
    partId: part.id,
    shape: part.shape,
    geometryKey: buildPartGeometryKey(part),
    position: [part.x, part.y, part.z],
    rotation: [part.rx * DEGREES_TO_RADIANS, part.ry * DEGREES_TO_RADIANS, part.rz * DEGREES_TO_RADIANS],
    materialId: part.materialId ?? null,
    resolved: part,
  };
}

/** The parts of an item resolved with its params; empty for hidden items and missing assets. */
export function buildItemParts(item: Item, asset: Asset | undefined): ItemPart[] {
  if (item.hidden) return [];
  if (!asset) {
    reportMissingAssetOnce(item.assetId);
    return [];
  }
  return resolveAsset(asset, item.params).parts.map(toItemPart);
}
