import type { Asset } from "./schemas/asset.ts";
import type { Material } from "./schemas/material.ts";
import type { Model } from "./schemas/model.ts";

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

function sortKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export function contentHash(value: unknown): string {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(JSON.stringify(value, sortKeys))) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

function hashWithoutId({ id: _id, ...content }: { id: string }): string {
  return contentHash(content);
}

export const assetContentHash = (asset: Asset) => hashWithoutId(asset);
export const materialContentHash = (material: Material) => hashWithoutId(material);
export const modelContentHash = (model: Model) => hashWithoutId(model);
