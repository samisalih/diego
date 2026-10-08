import { applyNormalizedParams } from "../asset/params.ts";
import { createId } from "../ids.ts";
import type { Asset } from "../schemas/asset.ts";
import { documentContentSchema, type DocumentContent } from "../schemas/document.ts";
import type { Item } from "../schemas/item.ts";
import type { ValidationIssue } from "../validation.ts";
import { fail, findUnknownIds, unknownIdIssue, validateResult, type OperationResult } from "./result.ts";

export type NewItem = Partial<Item> & { assetId: string; x: number; z: number };
export type ItemPatch = Partial<Item> & { id: string };

const POSITION_FIELDS = ["x", "z", "rotation"] as const;

function withItems(content: DocumentContent, items: Item[], changedIds: string[]): OperationResult<DocumentContent> {
  return validateResult(documentContentSchema, { ...content, items }, changedIds);
}

export function placeItems(content: DocumentContent, newItems: NewItem[], assets: Asset[]): OperationResult<DocumentContent> {
  const issues: ValidationIssue[] = [];
  const placed: Item[] = [];
  newItems.forEach((newItem, index) => {
    const asset = assets.find((candidate) => candidate.id === newItem.assetId);
    if (!asset) {
      issues.push(unknownIdIssue(`items.${newItem.id ?? index}.assetId`, newItem.assetId, "asset"));
      return;
    }
    const item = { id: createId("item"), rotation: 0, locked: false, hidden: false, lightOn: false, params: {}, ...newItem };
    item.rotation = normalizeRotation(item.rotation);
    placed.push(applyNormalizedParams(item, asset.params, newItem.params ?? {}));
  });
  if (issues.length > 0) return fail(issues);
  return withItems(content, [...content.items, ...placed], placed.map((item) => item.id));
}

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

function findLockedPositionIssues(item: Item, patch: ItemPatch): ValidationIssue[] {
  if (!item.locked || patch.locked === false) return [];
  return POSITION_FIELDS.filter((field) => patch[field] !== undefined).map((field) => ({
    field: `items.${item.id}.${field}`,
    value: patch[field],
    allowed: "unchanged while the item is locked",
    message: `Item "${item.id}" is locked; set locked to false to change ${field}`,
  }));
}

function applyPatch(item: Item, patch: ItemPatch, assets: Asset[]): Item {
  const { params, ...fields } = patch;
  const patched = { ...item, ...fields };
  if (fields.rotation !== undefined) patched.rotation = normalizeRotation(fields.rotation);
  if (params === undefined) return patched;
  const asset = assets.find((candidate) => candidate.id === patched.assetId);
  return asset ? applyNormalizedParams(patched, asset.params, { ...item.params, ...params }) : patched;
}

function findUnknownAssetIssues(item: Item, patch: ItemPatch, assets: Asset[]): ValidationIssue[] {
  if (patch.params === undefined) return [];
  const assetId = patch.assetId ?? item.assetId;
  if (assets.some((asset) => asset.id === assetId)) return [];
  return [unknownIdIssue(`items.${item.id}.assetId`, assetId, "asset")];
}

export function updateItems(content: DocumentContent, patches: ItemPatch[], assets: Asset[]): OperationResult<DocumentContent> {
  const issues = findUnknownIds("items", patches.map((patch) => patch.id), content.items, "item");
  const itemsById = new Map(content.items.map((item) => [item.id, item]));
  for (const patch of patches) {
    const item = itemsById.get(patch.id);
    if (!item) continue;
    issues.push(...findLockedPositionIssues(item, patch), ...findUnknownAssetIssues(item, patch, assets));
  }
  if (issues.length > 0) return fail(issues);

  const patchesById = new Map(patches.map((patch) => [patch.id, patch]));
  const items = content.items.map((item) => {
    const patch = patchesById.get(item.id);
    return patch ? applyPatch(item, patch, assets) : item;
  });
  return withItems(content, items, patches.map((patch) => patch.id));
}

export function removeItems(content: DocumentContent, ids: string[]): OperationResult<DocumentContent> {
  const issues = findUnknownIds("items", ids, content.items, "item");
  if (issues.length > 0) return fail(issues);
  return withItems(content, content.items.filter((item) => !ids.includes(item.id)), ids);
}

export function duplicateItems(content: DocumentContent, ids: string[], offset: [number, number] = [0.1, 0.1]): OperationResult<DocumentContent> {
  const issues = findUnknownIds("items", ids, content.items, "item");
  if (issues.length > 0) return fail(issues);
  const copies = ids.map((id) => {
    const original = content.items.find((item) => item.id === id)!;
    return { ...structuredClone(original), id: createId("item"), x: original.x + offset[0], z: original.z + offset[1] };
  });
  return withItems(content, [...content.items, ...copies], copies.map((copy) => copy.id));
}

export function removeAssetFromContent(content: DocumentContent, assetId: string): { content: DocumentContent; removedItems: Item[] } {
  const removedItems = content.items.filter((item) => item.assetId === assetId);
  return { content: { ...content, items: content.items.filter((item) => item.assetId !== assetId) }, removedItems };
}

export function restoreItemsToContent(content: DocumentContent, items: Item[]): DocumentContent {
  return { ...content, items: [...content.items, ...items] };
}
