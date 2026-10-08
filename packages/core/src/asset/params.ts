import type { Asset, AssetParam } from "../schemas/asset.ts";
import type { Item } from "../schemas/item.ts";

export interface NormalizedParams {
  values: Record<string, number>;
  clampedKeys: string[];
}

export function normalizeParams(params: AssetParam[], values: Record<string, number>): NormalizedParams {
  const normalized: Record<string, number> = {};
  const clampedKeys: string[] = [];
  for (const param of params) {
    const requested = Object.hasOwn(values, param.key) ? (values[param.key] as number) : param.default;
    const clamped = Math.min(Math.max(requested, param.min), param.max);
    if (clamped !== requested) clampedKeys.push(param.key);
    normalized[param.key] = param.unit === "count" ? Math.round(clamped) : clamped;
  }
  return { values: normalized, clampedKeys };
}

export function reconcileItemsWithAsset(items: Item[], asset: Asset): Item[] {
  return items.map((item) => {
    if (item.assetId !== asset.id) return item;
    const { clampedParams: _stale, ...rest } = item;
    const { values, clampedKeys } = normalizeParams(asset.params, item.params);
    return clampedKeys.length > 0
      ? { ...rest, params: values, clampedParams: clampedKeys }
      : { ...rest, params: values };
  });
}
