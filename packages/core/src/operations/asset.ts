import { assetSchema, type Asset, type AssetParam, type Part } from "../schemas/asset.ts";
import { mergeByKey, validateResult, type OperationResult } from "./result.ts";

export interface AssetDefinitionChanges {
  meta?: Partial<Pick<Asset, "name" | "category">>;
  upsertParams?: (Partial<AssetParam> & { key: string })[];
  removeParams?: string[];
  upsertParts?: (Partial<Part> & { id: string })[];
  removeParts?: string[];
}

export function upsertAssetDefinition(asset: Asset, changes: AssetDefinitionChanges): OperationResult<Asset> {
  const remainingParams = asset.params.filter((param) => !changes.removeParams?.includes(param.key));
  const remainingParts = asset.parts.filter((part) => !changes.removeParts?.includes(part.id));
  const candidate = {
    ...asset,
    ...changes.meta,
    params: mergeByKey(remainingParams, changes.upsertParams ?? [], "key"),
    parts: mergeByKey(remainingParts, changes.upsertParts ?? [], "id"),
  };
  const changedIds = [
    ...(changes.upsertParts ?? []).map((part) => part.id),
    ...(changes.removeParts ?? []),
    ...(changes.upsertParams ?? []).map((param) => param.key),
    ...(changes.removeParams ?? []),
  ];
  return validateResult(assetSchema, candidate, changedIds);
}

export function replaceMaterialInAsset(asset: Asset, materialId: string, replacementId: string | null): OperationResult<Asset> {
  const changedIds: string[] = [];
  const parts = asset.parts.map((part) => {
    if (part.materialId !== materialId) return part;
    changedIds.push(part.id);
    return { ...part, materialId: replacementId };
  });
  return validateResult(assetSchema, { ...asset, parts }, changedIds);
}
