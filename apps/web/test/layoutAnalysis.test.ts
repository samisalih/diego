import type { Item } from "@app/core";
import { describe, expect, it } from "vitest";
import { itemsWithPreview } from "../src/editor/layoutAnalysis.ts";

// Contract: docs/specs/editor.md section 6.2 / 5.1 (live drag preview shared by viewport, tree and inspector).
// Interpretations made by the tests:
// - itemsWithPreview(items, null) returns `items` itself
// - with a preview, items listed in it get the preview x/z (other fields untouched), all others are returned as the same
//   object, the input is never mutated, and the same (items, preview) arguments return the same array (identity)

const item = (id: string, x: number, z: number): Item => ({ id, assetId: "asset_sofa", name: id, x, z, rotation: 90, params: { width: 2 }, locked: true, hidden: false, lightOn: true });
const items = (): Item[] => [item("item_a", 1, 1), item("item_b", 2, 2), item("item_c", 3, 3)];

describe("itemsWithPreview", () => {
  // Red if the no-preview case allocates a new array (every render would invalidate the layout cache).
  it("returns the very same array without a preview", () => {
    const list = items();
    expect(itemsWithPreview(list, null)).toBe(list);
  });

  // Red if the preview position is not applied to x and z.
  it("moves the previewed items to their preview position", () => {
    const result = itemsWithPreview(items(), new Map([["item_b", { x: 7, z: 8 }]]));
    expect(result.find((entry) => entry.id === "item_b")).toMatchObject({ x: 7, z: 8 });
  });

  // Red if other fields of a previewed item are lost or changed.
  it("keeps every other field of a previewed item", () => {
    const original = item("item_b", 2, 2);
    const [result] = itemsWithPreview([original], new Map([["item_b", { x: 7, z: 8 }]]));
    expect(result).toEqual({ ...original, x: 7, z: 8 });
  });

  // Red if untouched items are copied (their identity is what memoised consumers compare).
  it("returns items outside the preview as the same objects", () => {
    const list = items();
    const result = itemsWithPreview(list, new Map([["item_b", { x: 7, z: 8 }]]));
    expect(result[0]).toBe(list[0]);
    expect(result[2]).toBe(list[2]);
    expect(result[1]).not.toBe(list[1]);
  });

  // Red if the order changes or items are dropped.
  it("keeps the order and the length", () => {
    const result = itemsWithPreview(items(), new Map([["item_c", { x: 0, z: 0 }], ["item_a", { x: 9, z: 9 }]]));
    expect(result.map((entry) => entry.id)).toEqual(["item_a", "item_b", "item_c"]);
  });

  // Red if the preview mutates the document items in place (the committed state would change during a drag).
  it("does not mutate its input", () => {
    const list = items();
    itemsWithPreview(list, new Map([["item_a", { x: 9, z: 9 }]]));
    expect(list).toEqual(items());
  });

  // Red if a preview id that matches no item adds or breaks something.
  it("ignores preview entries without a matching item", () => {
    const list = items();
    const result = itemsWithPreview(list, new Map([["item_gone", { x: 1, z: 1 }]]));
    expect(result).toEqual(list);
  });

  // Red if the result is not cached: identity is what lets the layout analysis run once per preview update.
  it("returns the same array for the same items and preview", () => {
    const list = items();
    const preview = new Map([["item_a", { x: 5, z: 5 }]]);
    expect(itemsWithPreview(list, preview)).toBe(itemsWithPreview(list, preview));
  });

  // Red if the cache ignores the preview and returns stale positions for the next drag step.
  it("recomputes for a new preview object", () => {
    const list = items();
    const first = itemsWithPreview(list, new Map([["item_a", { x: 5, z: 5 }]]));
    const second = itemsWithPreview(list, new Map([["item_a", { x: 6, z: 6 }]]));
    expect(second).not.toBe(first);
    expect(second[0]).toMatchObject({ x: 6, z: 6 });
  });

  // Red if the cache ignores the items and returns the old document state after a commit.
  it("recomputes for a new items array with the same preview", () => {
    const preview = new Map([["item_a", { x: 5, z: 5 }]]);
    const first = itemsWithPreview(items(), preview);
    const changed = items().map((entry) => (entry.id === "item_b" ? { ...entry, x: 20 } : entry));
    const second = itemsWithPreview(changed, preview);
    expect(second).not.toBe(first);
    expect(second.find((entry) => entry.id === "item_b")?.x).toBe(20);
  });

  // Red if an empty preview is cached against a null preview or breaks the identity contract.
  it("returns a stable array for an empty preview", () => {
    const list = items();
    const preview = new Map<string, { x: number; z: number }>();
    expect(itemsWithPreview(list, preview)).toEqual(list);
    expect(itemsWithPreview(list, preview)).toBe(itemsWithPreview(list, preview));
  });
});
