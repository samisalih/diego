import type { Item } from "@app/core";
import { describe, expect, it } from "vitest";
import {
  CLICK_THRESHOLD_M,
  SNAP_STEP_FINE_M,
  SNAP_STEP_COARSE_M,
  dragDelta,
  dragPatches,
  floorPointFromRay,
  isClick,
  snapStepFor,
} from "../src/editor/drag.ts";

// Contract: docs/specs/editor.md section 3.2. Interpretations made by the tests (the implementation follows them):
// - vectors are plain tuples: floorPointFromRay(origin: [x, y, z], direction: [x, y, z]) -> [x, z] | null
//   (null when the ray is parallel to the floor or points away from it); direction need not be normalised
// - dragDelta(start: [x, z], current: [x, z]) -> [dx, dz], the raw difference without snapping
// - constants: SNAP_STEP_FINE_M = 0.01, SNAP_STEP_COARSE_M = 0.1 (Shift), CLICK_THRESHOLD_M = 0.005
// - snapStepFor(shiftKey: boolean) -> SNAP_STEP_COARSE_M when Shift is held, else SNAP_STEP_FINE_M
// - isClick(delta: [dx, dz]) -> true when the drag length is below CLICK_THRESHOLD_M (exactly the threshold is a drag)
// - dragPatches(items: Item[], selectedIds: string[], delta: [dx, dz], snapStep: number) -> ItemPatch[]
//   one { id, x, z } patch per selected, existing, unlocked item; the NEW ABSOLUTE position (item + delta) is snapped to
//   the step grid (not the delta); locked items, unselected items and unknown ids are skipped; order follows `items`

function item(id: string, x: number, z: number, overrides: Partial<Item> = {}): Item {
  return { id, assetId: "asset_chair", name: null, x, z, rotation: 0, params: {}, locked: false, hidden: false, lightOn: false, ...overrides } as Item;
}

describe("floorPointFromRay", () => {
  // Red if the intersection with y = 0 is computed wrongly (straight down).
  it("hits the floor straight below the origin", () => {
    expect(floorPointFromRay([1, 2, 3], [0, -1, 0])).toEqual([1, 3]);
  });

  // Red if the slope is ignored or x and z are swapped: t = 2 reaches x = 2, z = 4.
  it("hits the floor along an oblique ray", () => {
    const point = floorPointFromRay([0, 2, 1], [1, -1, 1.5])!;
    expect(point[0]).toBeCloseTo(2, 9);
    expect(point[1]).toBeCloseTo(4, 9);
  });

  // Red if the direction is assumed to be normalised.
  it("does not depend on the length of the direction", () => {
    const point = floorPointFromRay([0, 2, 1], [10, -10, 15])!;
    expect(point[0]).toBeCloseTo(2, 9);
    expect(point[1]).toBeCloseTo(4, 9);
  });

  // Red if a horizontal ray returns a point (division by zero) instead of null.
  it("returns null for a ray parallel to the floor", () => {
    expect(floorPointFromRay([0, 2, 0], [1, 0, 0])).toBeNull();
  });

  // Red if a ray pointing up still yields the mirrored hit behind the origin.
  it("returns null for a ray pointing away from the floor", () => {
    expect(floorPointFromRay([0, 2, 0], [0, 1, 0])).toBeNull();
    expect(floorPointFromRay([0, 2, 0], [1, 0.2, 1])).toBeNull();
  });
});

describe("dragDelta", () => {
  // Red if the sign is reversed (current - start).
  it("is current minus start in x and z", () => {
    const [dx, dz] = dragDelta([1, 2], [1.5, 1.25]);
    expect(dx).toBeCloseTo(0.5, 9);
    expect(dz).toBeCloseTo(-0.75, 9);
  });

  it("is zero when the pointer did not move", () => {
    expect(dragDelta([3, 4], [3, 4])).toEqual([0, 0]);
  });
});

describe("snapping constants", () => {
  // Red if the steps are not 1 cm and 10 cm (Shift).
  it("snaps to 0.01 m, and to 0.1 m while Shift is held", () => {
    expect(SNAP_STEP_FINE_M).toBe(0.01);
    expect(SNAP_STEP_COARSE_M).toBe(0.1);
    expect(snapStepFor(false)).toBe(0.01);
    expect(snapStepFor(true)).toBe(0.1);
  });
});

describe("isClick", () => {
  // Red if the threshold is not 5 mm.
  it("uses a threshold of 0.005 m", () => {
    expect(CLICK_THRESHOLD_M).toBe(0.005);
  });

  // Red if tiny movements count as drags (would write a revision for a plain click).
  it("treats a drag shorter than 0.005 m as a click", () => {
    expect(isClick([0, 0])).toBe(true);
    expect(isClick([0.004, 0])).toBe(true);
    expect(isClick([0.003, 0.003])).toBe(true); // length 0.00424
  });

  // Red if the length is measured per axis instead of as a distance, or the comparison is off by one side.
  it("treats a drag of 0.005 m or more as a drag, in any direction", () => {
    expect(isClick([0.005, 0])).toBe(false);
    expect(isClick([0, -0.006])).toBe(false);
    expect(isClick([0.004, 0.004])).toBe(false); // length 0.00566
  });
});

describe("dragPatches", () => {
  const items = [item("item_a", 2.303, 3.91), item("item_b", 0.8, 3.75), item("item_c", 5, 5), item("item_locked", 1.017, 1.017, { locked: true })];

  // Red if the delta is not applied to every selected item or the patch carries other fields.
  it("moves every selected item by the delta", () => {
    const patches = dragPatches(items, ["item_a", "item_b"], [1, -0.5], 0.01);
    expect(patches.map((patch) => patch.id)).toEqual(["item_a", "item_b"]);
    expect(patches[0]!.x).toBeCloseTo(3.3, 9);
    expect(patches[0]!.z).toBeCloseTo(3.41, 9);
    expect(patches[1]!.x).toBeCloseTo(1.8, 9);
    expect(patches[1]!.z).toBeCloseTo(3.25, 9);
    expect(Object.keys(patches[0]!).sort()).toEqual(["id", "x", "z"]);
  });

  // Red if the delta is snapped instead of the resulting position (2.303 + 0.04 = 2.343 would stay off-grid).
  it("snaps the resulting absolute position to 0.01 m", () => {
    const [patch] = dragPatches(items, ["item_a"], [0.0449, 0.0011], 0.01);
    expect(patch!.x).toBeCloseTo(2.35, 9);
    expect(patch!.z).toBeCloseTo(3.91, 9);
  });

  // Red if Shift (step 0.1) is ignored.
  it("snaps to 0.1 m with the coarse step", () => {
    const [patch] = dragPatches(items, ["item_a"], [0.0449, 0.0011], 0.1);
    expect(patch!.x).toBeCloseTo(2.3, 9);
    expect(patch!.z).toBeCloseTo(3.9, 9);
  });

  // Red if locked items move along with the selection.
  it("skips locked items in a multi-selection", () => {
    const patches = dragPatches(items, ["item_a", "item_locked", "item_b"], [1, 1], 0.01);
    expect(patches.map((patch) => patch.id)).toEqual(["item_a", "item_b"]);
  });

  // Red if a selection of locked items only still produces patches (updateItems would reject them).
  it("returns no patches when every selected item is locked", () => {
    expect(dragPatches(items, ["item_locked"], [1, 1], 0.01)).toEqual([]);
  });

  // Red if unselected items or unknown ids are moved or crash the function.
  it("ignores unselected items and unknown ids", () => {
    const patches = dragPatches(items, ["item_c", "item_missing"], [0.5, 0.5], 0.01);
    expect(patches).toEqual([{ id: "item_c", x: expect.closeTo(5.5, 9), z: expect.closeTo(5.5, 9) }]);
  });

  // Red if an empty selection produces patches.
  it("returns no patches for an empty selection", () => {
    expect(dragPatches(items, [], [1, 1], 0.01)).toEqual([]);
  });

  // Red if the input items are mutated during the drag preview.
  it("does not mutate the items", () => {
    const snapshot = structuredClone(items);
    dragPatches(items, ["item_a"], [1, 1], 0.01);
    expect(items).toEqual(snapshot);
  });
});

describe("dragPatches floating-point cleanliness", () => {
  // The patch values are written to the database; they must be exactly the decimal the grid names, e.g. 2.57, not 2.5700000000000003.
  const isOnGrid = (value: number | undefined, decimals: number): boolean => value !== undefined && Number(value.toFixed(decimals)) === value;

  // Red if the snapped position is computed as round(v / step) * step (257 * 0.01 = 2.5700000000000003).
  it("returns exactly representable positions at the fine step", () => {
    const [patch] = dragPatches([item("item_a", 2.3, 3.1)], ["item_a"], [0.27, 0.57], 0.01);
    expect(patch!.x).toBe(2.57);
    expect(patch!.z).toBe(3.67);
  });

  // Red if the coarse step produces artefacts such as 0.30000000000000004 or 0.7000000000000001.
  it("returns exactly representable positions at the coarse step", () => {
    const [first] = dragPatches([item("item_a", 0.2, 0.6)], ["item_a"], [0.1, 0.1], 0.1);
    expect(first!.x).toBe(0.3);
    expect(first!.z).toBe(0.7);
    const [second] = dragPatches([item("item_a", 2.3, 4.1)], ["item_a"], [0.27, 0.27], 0.1);
    expect(second!.x).toBe(2.6);
    expect(second!.z).toBe(4.4);
  });

  // Red if any position on a sweep of starts and deltas carries a floating-point artefact.
  it("never carries artefacts over a sweep of starts and deltas", () => {
    for (let start = 0; start <= 60; start += 1) {
      for (let step = 0; step <= 40; step += 1) {
        const [fine] = dragPatches([item("item_a", start / 10 + 0.03, start / 7)], ["item_a"], [step * 0.037, -step * 0.013], SNAP_STEP_FINE_M);
        expect(isOnGrid(fine?.x, 2), `fine x start=${start} step=${step}: ${fine?.x}`).toBe(true);
        expect(isOnGrid(fine?.z, 2), `fine z start=${start} step=${step}: ${fine?.z}`).toBe(true);
        const [coarse] = dragPatches([item("item_a", start / 10 + 0.03, start / 7)], ["item_a"], [step * 0.037, -step * 0.013], SNAP_STEP_COARSE_M);
        expect(isOnGrid(coarse?.x, 1), `coarse x start=${start} step=${step}: ${coarse?.x}`).toBe(true);
        expect(isOnGrid(coarse?.z, 1), `coarse z start=${start} step=${step}: ${coarse?.z}`).toBe(true);
      }
    }
  });

  // Red if negative zero leaks out (a position snapped from -0.004 would print as -0).
  it("does not produce negative zero", () => {
    const [patch] = dragPatches([item("item_a", 0.01, 0.01)], ["item_a"], [-0.014, -0.014], 0.01);
    expect(Object.is(patch!.x, -0)).toBe(false);
    expect(Object.is(patch!.z, -0)).toBe(false);
  });
});
