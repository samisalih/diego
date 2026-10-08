import { encodeToon, type TextFormat } from "../toon.ts";
import type { Asset } from "../schemas/asset.ts";
import type { DocumentContent } from "../schemas/document.ts";
import type { ExportBundle } from "../schemas/export.ts";
import type { Material } from "../schemas/material.ts";
import type { Model } from "../schemas/model.ts";

export type EntityPool = { assets: Asset[]; materials: Material[]; models: Model[] };

function collectStrings(values: (string | null | undefined)[]): Set<string> {
  return new Set(values.filter((value): value is string => typeof value === "string"));
}

export function buildExportBundle(content: DocumentContent, pool: EntityPool): ExportBundle {
  const assetIds = collectStrings(content.items.map((item) => item.assetId));
  const assets = pool.assets.filter((asset) => assetIds.has(asset.id));
  const parts = assets.flatMap((asset) => asset.parts);
  const { rooms, openings } = content.apartment;
  const materialIds = collectStrings([
    ...rooms.flatMap((room) => [room.floorMaterialId, room.wallMaterialId, room.ceilingMaterialId]),
    ...openings.map((opening) => opening.frameMaterialId),
    ...parts.map((part) => part.materialId),
  ]);
  const modelIds = collectStrings(parts.map((part) => part.modelId));
  return {
    format: "apartment-planner",
    version: 1,
    document: content,
    assets,
    materials: pool.materials.filter((material) => materialIds.has(material.id)),
    models: pool.models.filter((model) => modelIds.has(model.id)),
  };
}

export function serializeBundle(bundle: ExportBundle, format: TextFormat): string {
  return format === "json" ? JSON.stringify(bundle, null, 2) : encodeToon(bundle);
}
