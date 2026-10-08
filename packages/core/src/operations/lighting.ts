import type { Asset } from "../schemas/asset.ts";
import { documentContentSchema, type DocumentContent } from "../schemas/document.ts";
import type { Lighting } from "../schemas/lighting.ts";
import { validateResult, type OperationResult } from "./result.ts";

export type LightingPatch = Partial<Lighting> & { allLamps?: boolean };

export function setLighting(content: DocumentContent, patch: LightingPatch, assets: Asset[]): OperationResult<DocumentContent> {
  const { allLamps, ...lightingPatch } = patch;
  const lampAssetIds = new Set(assets.filter((asset) => asset.parts.some((part) => part.light)).map((asset) => asset.id));
  const changedIds: string[] = [];

  const items = content.items.map((item) => {
    if (allLamps === undefined || !lampAssetIds.has(item.assetId)) return item;
    changedIds.push(item.id);
    return { ...item, lightOn: allLamps };
  });

  return validateResult(documentContentSchema, { ...content, items, lighting: { ...content.lighting, ...lightingPatch } }, changedIds);
}
