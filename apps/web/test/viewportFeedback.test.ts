import { SEED_ASSETS } from "../../../packages/core/src/seed/index.ts";
import { itemObb, assetFootprint, resolveAsset, type Item, type LayoutIssue, type Obb, type Wall } from "@app/core";
import { describe, expect, it } from "vitest";
import { closestPoints, flaggedSelectedFootprints, footprintOf, outlineGroups, passageLines } from "../src/editor/viewportFeedback.ts";

// Contract: docs/specs/editor.md section 5.3. Interpretations made by the tests:
// - outlineGroups(items, selectedIds, issues) -> { blueIds, redIds } in item order; blue = selected existing items;
//   red = existing, NOT selected items that are subject or object of a collision / blockedOpening / outsideRoom issue
// - flaggedSelectedFootprints(...) -> footprints (Obb) of selected items with such an issue (red rectangle under the blue outline)
// - closestPoints(a, b) -> [pointOnA, pointOnB], the shortest connection of two separate boxes
// - passageLines(...) -> one { key: "<subjectId>:<objectId>", from, to, centimetres } per narrowPassage issue

const assetsById = new Map(SEED_ASSETS.map((asset) => [asset.id, asset]));
const item = (id: string, x = 2, z = 2, assetId = "asset_chair"): Item => ({ id, assetId, name: id, x, z, rotation: 0, params: {}, locked: false, hidden: false, lightOn: true });
const issue = (kind: LayoutIssue["kind"], subjectId: string, objectId: string | null = null, value: number | null = null): LayoutIssue =>
  ({ kind, subjectId, objectId, value, detail: null });

describe("outlineGroups", () => {
  const items = [item("item_a"), item("item_b"), item("item_c")];

  // Red if the selection is not outlined blue.
  it("outlines selected items blue, in item order", () => {
    expect(outlineGroups(items, ["item_c", "item_a"], [])).toEqual({ blueIds: ["item_a", "item_c"], redIds: [] });
  });

  // Red if either side of a collision is missing from the red group.
  it("outlines both sides of a collision red when unselected", () => {
    expect(outlineGroups(items, [], [issue("collision", "item_a", "item_b")])).toEqual({ blueIds: [], redIds: ["item_a", "item_b"] });
  });

  // Red if a selected flagged item loses its blue outline or also appears in the red group.
  it("keeps a selected item with a collision blue only, and its partner red", () => {
    expect(outlineGroups(items, ["item_a"], [issue("collision", "item_a", "item_b")])).toEqual({ blueIds: ["item_a"], redIds: ["item_b"] });
  });

  // Red if a kind that is not in the spec list turns an item red.
  it.each(["narrowPassage", "clampedParam", "adjustedParam", "unknownAsset"] as const)("does not outline red for %s", (kind) => {
    expect(outlineGroups(items, [], [issue(kind, "item_a", "item_b")]).redIds).toEqual([]);
  });

  // Red if blockedOpening or outsideRoom do not count.
  it("outlines red for blockedOpening (item as object) and outsideRoom", () => {
    const issues = [issue("blockedOpening", "opening_front_door", "item_b"), issue("outsideRoom", "item_c")];
    expect(outlineGroups(items, [], issues).redIds).toEqual(["item_b", "item_c"]);
  });

  // Red if wall / opening ids or deleted items leak into the id lists.
  it("only lists ids of existing items", () => {
    const result = outlineGroups(items, ["item_gone"], [issue("collision", "item_a", "wall_north"), issue("collision", "item_gone", "opening_x")]);
    expect(result).toEqual({ blueIds: [], redIds: ["item_a"] });
  });

  // Red if an item with several issues is listed more than once.
  it("lists an item once however many issues it has", () => {
    const issues = [issue("collision", "item_a", "item_b"), issue("outsideRoom", "item_a"), issue("collision", "item_c", "item_a")];
    expect(outlineGroups(items, [], issues).redIds).toEqual(["item_a", "item_b", "item_c"]);
  });

  it("returns empty groups for nothing", () => {
    expect(outlineGroups([], [], [])).toEqual({ blueIds: [], redIds: [] });
  });
});

describe("flaggedSelectedFootprints", () => {
  const items = [item("item_a", 1, 1), item("item_b", 3, 3, "asset_sofa"), item("item_c", 5, 5)];
  const expected = (entry: Item): Obb => itemObb(entry, assetFootprint(resolveAsset(assetsById.get(entry.assetId)!, entry.params)));

  // Red if the footprint is not the item's own ground OBB.
  it("returns the footprint of a selected item with a collision", () => {
    expect(flaggedSelectedFootprints(items, ["item_b"], assetsById, [issue("collision", "item_b", "wall_north")])).toEqual([expected(items[1]!)]);
  });

  // Red if the object side of an issue is not considered flagged.
  it("flags a selected item that is the object of an issue", () => {
    expect(flaggedSelectedFootprints(items, ["item_a"], assetsById, [issue("collision", "item_c", "item_a")])).toEqual([expected(items[0]!)]);
  });

  // Red if unselected flagged items get a red rectangle (they already get the red outline).
  it("ignores flagged items that are not selected", () => {
    expect(flaggedSelectedFootprints(items, ["item_a"], assetsById, [issue("collision", "item_b", "item_c")])).toEqual([]);
  });

  // Red if selected items without a qualifying issue get a rectangle.
  it("ignores selected items without a red-outline issue", () => {
    expect(flaggedSelectedFootprints(items, ["item_a"], assetsById, [issue("narrowPassage", "item_a", "item_b", 0.5), issue("clampedParam", "item_a")])).toEqual([]);
  });

  // Red if the footprints are not in item order or a multiply flagged item repeats.
  it("returns one footprint per flagged selected item in item order", () => {
    const issues = [issue("collision", "item_a", "item_b"), issue("outsideRoom", "item_a")];
    expect(flaggedSelectedFootprints(items, ["item_b", "item_a"], assetsById, issues)).toEqual([expected(items[0]!), expected(items[1]!)]);
  });

  // Red if an unknown asset crashes or yields a bogus box.
  it("skips selected items whose asset is unknown", () => {
    const orphan = item("item_orphan", 1, 1, "asset_missing");
    expect(flaggedSelectedFootprints([orphan], ["item_orphan"], assetsById, [issue("outsideRoom", "item_orphan")])).toEqual([]);
  });
});

describe("footprintOf", () => {
  // Red if the item position or rotation is not applied.
  it("moves with the item", () => {
    const first = footprintOf(item("item_a", 1, 1), assetsById)!;
    const second = footprintOf(item("item_a", 4, 6), assetsById)!;
    expect(second.cx - first.cx).toBeCloseTo(3, 9);
    expect(second.cz - first.cz).toBeCloseTo(5, 9);
  });

  it("is null for an unknown asset", () => {
    expect(footprintOf(item("item_a", 1, 1, "asset_missing"), assetsById)).toBeNull();
  });
});

describe("closestPoints", () => {
  const box = (cx: number, cz: number, angle = 0, hx = 1, hz = 1): Obb => ({ cx, cz, hx, hz, angle });
  const distance = ([from, to]: [[number, number], [number, number]]): number => Math.hypot(to[0] - from[0], to[1] - from[1]);

  // Red if the points are not the facing sides (distance 2 between x = 1 and x = 3).
  it("connects the facing sides of two side-by-side boxes", () => {
    const [from, to] = closestPoints(box(0, 0), box(4, 0));
    expect(distance([from, to])).toBeCloseTo(2, 9);
    expect(from[0]).toBeCloseTo(1, 9);
    expect(to[0]).toBeCloseTo(3, 9);
  });

  // Red if the pair is returned in the wrong order (first point belongs to the first box).
  it("returns the point on the first box first", () => {
    const [onFirst, onSecond] = closestPoints(box(0, 0), box(4, 0));
    const [onSecondSwapped, onFirstSwapped] = closestPoints(box(4, 0), box(0, 0));
    expect(onFirst[0]).toBeLessThan(onSecond[0]);
    expect(onSecondSwapped[0]).toBeCloseTo(onSecond[0], 9);
    expect(onFirstSwapped[0]).toBeCloseTo(onFirst[0], 9);
  });

  // Red if the connection is not the shortest (diagonal boxes touch corner to corner).
  it("connects the facing corners of diagonal boxes", () => {
    const [from, to] = closestPoints(box(0, 0), box(4, 4));
    expect(from[0]).toBeCloseTo(1, 9);
    expect(from[1]).toBeCloseTo(1, 9);
    expect(to[0]).toBeCloseTo(3, 9);
    expect(to[1]).toBeCloseTo(3, 9);
  });

  // Red if only corners of the first box are tried: here the closest point is a corner of the second one,
  // and if the rotation is ignored the distance would be that of unrotated boxes.
  it("finds the corner of a rotated second box", () => {
    const [from, to] = closestPoints(box(0, 0), box(4, 0, Math.PI / 4));
    expect(to[0]).toBeCloseTo(4 - Math.SQRT2, 9);
    expect(to[1]).toBeCloseTo(0, 9);
    expect(from[0]).toBeCloseTo(1, 9);
    expect(from[1]).toBeCloseTo(0, 9);
  });

  // Red if the shortest of the two directions is not taken (a long thin box above a small one).
  it("picks the shortest connection regardless of which box owns the vertex", () => {
    const [from, to] = closestPoints(box(0, 0, 0, 5, 0.5), box(0.5, 3, 0, 0.5, 0.5));
    expect(distance([from, to])).toBeCloseTo(2, 9);
    expect(from[1]).toBeCloseTo(0.5, 9);
    expect(to[1]).toBeCloseTo(2.5, 9);
  });
});

describe("passageLines", () => {
  const chairA = item("item_a", 2, 1);
  const chairB = item("item_b", 2, 3);
  const wallNorth: Wall = { id: "wall_north", startX: 0, startZ: 0.18, endX: 10, endZ: 0.18, thickness: 0.36, exterior: true };

  // Red if the key, the rounding to whole centimetres or the item-to-item connection is wrong.
  it("builds one line between two items with the gap in centimetres", () => {
    const [line] = passageLines([issue("narrowPassage", "item_a", "item_b", 0.456)], [chairA, chairB], [], assetsById);
    expect(line?.key).toBe("item_a:item_b");
    expect(line?.centimetres).toBe(46);
    const [expectedFrom, expectedTo] = closestPoints(footprintOf(chairA, assetsById)!, footprintOf(chairB, assetsById)!);
    expect(line?.from).toEqual(expectedFrom);
    expect(line?.to).toEqual(expectedTo);
  });

  // Red if walls are not resolved as obstacles: the wall end must lie on its south face (z = 0.36).
  it("resolves a wall as the second obstacle", () => {
    const [line] = passageLines([issue("narrowPassage", "item_a", "wall_north", 0.5)], [chairA], [wallNorth], assetsById);
    expect(line?.key).toBe("item_a:wall_north");
    expect(line?.centimetres).toBe(50);
    expect(line?.to[1]).toBeCloseTo(0.36, 9);
    expect(line?.from[1]).toBeGreaterThan(0.36);
  });

  // Red if a wall as the subject (first obstacle) is not resolved.
  it("resolves a wall as the first obstacle", () => {
    const [line] = passageLines([issue("narrowPassage", "wall_north", "item_a", 0.5)], [chairA], [wallNorth], assetsById);
    expect(line?.from[1]).toBeCloseTo(0.36, 9);
    expect(line?.to[1]).toBeGreaterThan(0.36);
  });

  // Red if other kinds produce measurement lines.
  it("ignores issues that are not narrow passages", () => {
    expect(passageLines([issue("collision", "item_a", "item_b", 0.1), issue("outsideRoom", "item_a")], [chairA, chairB], [], assetsById)).toEqual([]);
  });

  // Red if an unresolvable obstacle crashes or yields a line to nowhere.
  it("skips issues with an unknown or missing obstacle", () => {
    const issues = [issue("narrowPassage", "item_a", "item_gone", 0.5), issue("narrowPassage", "item_a", null, 0.5)];
    expect(passageLines(issues, [chairA], [], assetsById)).toEqual([]);
  });

  // Red if an item with an unknown asset (no footprint) produces a line.
  it("skips an obstacle whose asset is unknown", () => {
    const orphan = item("item_orphan", 2, 3, "asset_missing");
    expect(passageLines([issue("narrowPassage", "item_a", "item_orphan", 0.5)], [chairA, orphan], [], assetsById)).toEqual([]);
  });

  // Red if the output does not follow the issue order or drops lines.
  it("returns one line per narrow passage in issue order", () => {
    const issues = [issue("narrowPassage", "item_b", "item_a", 0.4), issue("narrowPassage", "item_a", "wall_north", 0.3)];
    const lines = passageLines(issues, [chairA, chairB], [wallNorth], assetsById);
    expect(lines.map((line) => line.key)).toEqual(["item_b:item_a", "item_a:wall_north"]);
    expect(lines.map((line) => line.centimetres)).toEqual([40, 30]);
  });

  // Red if a missing value is shown as NaN.
  it("shows 0 cm when the issue has no value", () => {
    const [line] = passageLines([issue("narrowPassage", "item_a", "item_b", null)], [chairA, chairB], [], assetsById);
    expect(line?.centimetres).toBe(0);
  });
});
