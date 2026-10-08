import { checkLayout, type Apartment, type Asset, type Item, type LayoutIssue } from "@app/core";
import { useMemo } from "react";
import { useSceneStore } from "../data/store.ts";
import { useEditorStore, type DragPreview } from "./editorStore.ts";
import { issuesBySubject } from "./layoutFeedback.ts";

export type LayoutAnalysis = { issues: LayoutIssue[]; bySubject: Map<string, LayoutIssue[]> };

let previewCache: { items: Item[]; preview: DragPreview; result: Item[] } | null = null;
let analysisCache: { apartment: Apartment; items: Item[]; assets: Map<string, Asset>; analysis: LayoutAnalysis } | null = null;

/** The items with the positions of an ongoing drag; the same arguments always return the same array. */
export function itemsWithPreview(items: Item[], preview: DragPreview | null): Item[] {
  if (!preview) return items;
  if (previewCache?.items === items && previewCache.preview === preview) return previewCache.result;
  const result = items.map((item) => {
    const position = preview.get(item.id);
    return position ? { ...item, x: position.x, z: position.z } : item;
  });
  previewCache = { items, preview, result };
  return result;
}

const NO_ITEMS: Item[] = [];

/** The items as they are shown right now: document items with the drag preview applied. */
export function useEffectiveItems(): Item[] {
  const items = useSceneStore((state) => state.document?.items) ?? NO_ITEMS;
  const preview = useEditorStore((state) => state.dragPreview);
  return itemsWithPreview(items, preview);
}

/**
 * Layout check of the displayed state. A single-entry cache keyed on identity lets the viewport, tree
 * and inspector share one result, and a drag runs it at most once per preview update.
 */
export function useLayoutAnalysis(): LayoutAnalysis | null {
  const document = useSceneStore((state) => state.document);
  const assets = useSceneStore((state) => state.assets);
  const items = useEffectiveItems();
  const apartment = document?.apartment;
  return useMemo(() => {
    if (!document || !apartment) return null;
    if (analysisCache?.apartment === apartment && analysisCache.items === items && analysisCache.assets === assets) return analysisCache.analysis;
    const issues = checkLayout({ ...document, items }, assets);
    const analysis = { issues, bySubject: issuesBySubject(issues) };
    analysisCache = { apartment, items, assets, analysis };
    return analysis;
    // The document object changes with every version bump; its checked content is apartment and items.
  }, [apartment, items, assets]); // eslint-disable-line react-hooks/exhaustive-deps
}
