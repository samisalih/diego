import { describe, expect, it } from "vitest";
import { normalizeParams, reconcileItemsWithAsset } from "../src/asset/params.ts";
import { assetFootprint, resolveAsset } from "../src/asset/resolve.ts";
import { buildValidAsset, buildValidItem } from "./fixtures.ts";

// Assumed shape (spec leaves it open): BoundingBox = { min: [x, y, z], max: [x, y, z] },
// the same shape as the model boundingBox in spec 3.5.

type AssetFixture = ReturnType<typeof buildValidAsset>;
type PartFixture = AssetFixture["parts"][number];

function buildBox(overrides: Record<string, unknown> = {}): PartFixture {
  return {
    id: "part_box",
    name: "Box",
    shape: "box",
    x: 0,
    y: 0,
    z: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    w: 1,
    h: 1,
    d: 1,
    bevel: 0,
    ...overrides,
  } as PartFixture;
}

function buildAssetWith(parts: PartFixture[]): AssetFixture {
  return { ...buildValidAsset(), params: [], parts };
}

const sofaParams = () => buildValidAsset().params as never;

describe("normalizeParams", () => {
  // Red if defaults are not filled in for missing keys.
  it("fills missing keys with their default", () => {
    const result = normalizeParams(sofaParams(), {});
    expect(result.values).toEqual({ width: 1.8, legCount: 4 });
    expect(result.clampedKeys).toEqual([]);
  });

  // Red if in-range values are altered or reported as clamped.
  it("keeps in-range values untouched", () => {
    const result = normalizeParams(sofaParams(), { width: 2.5, legCount: 6 });
    expect(result.values).toEqual({ width: 2.5, legCount: 6 });
    expect(result.clampedKeys).toEqual([]);
  });

  // Red if unknown keys leak through.
  it("drops keys that are not declared by the asset", () => {
    const result = normalizeParams(sofaParams(), { width: 2, bogus: 9 });
    expect(result.values).toEqual({ width: 2, legCount: 4 });
    expect(Object.keys(result.values)).not.toContain("bogus");
    expect(result.clampedKeys).not.toContain("bogus");
  });

  // Red if clamping is missing, one-sided, or clampedKeys is not reported.
  it("clamps above max and below min and lists the clamped keys", () => {
    const high = normalizeParams(sofaParams(), { width: 99, legCount: 4 });
    expect(high.values.width).toBe(3);
    expect(high.clampedKeys).toEqual(["width"]);

    const low = normalizeParams(sofaParams(), { width: 0.1, legCount: 1 });
    expect(low.values).toEqual({ width: 0.6, legCount: 2 });
    expect([...low.clampedKeys].sort()).toEqual(["legCount", "width"]);
  });

  // Red if a value exactly on the boundary is reported as clamped (off-by-one on comparison).
  it("does not report boundary values as clamped", () => {
    const result = normalizeParams(sofaParams(), { width: 3, legCount: 2 });
    expect(result.values).toEqual({ width: 3, legCount: 2 });
    expect(result.clampedKeys).toEqual([]);
  });

  // Red if count units are not rounded; also pins round-half-up (Math.round), not floor.
  it("rounds count-unit values to integers", () => {
    expect(normalizeParams(sofaParams(), { legCount: 4.4 }).values.legCount).toBe(4);
    expect(normalizeParams(sofaParams(), { legCount: 4.6 }).values.legCount).toBe(5);
  });

  // Red if rounding is applied to non-count units.
  it("does not round non-count units", () => {
    expect(normalizeParams(sofaParams(), { width: 1.234 }).values.width).toBe(1.234);
  });

  // Red if rounding alone marks a count value as clamped.
  it("does not list a count value as clamped when only rounding changed it", () => {
    const result = normalizeParams(sofaParams(), { legCount: 4.4 });
    expect(result.clampedKeys).toEqual([]);
  });
});

describe("reconcileItemsWithAsset", () => {
  const asset = () => buildValidAsset() as never;

  // Red if items of other assets are touched.
  it("leaves items of other assets unchanged", () => {
    const other = { ...buildValidItem(), id: "item_other", assetId: "asset_other", params: { foo: 1 } };
    const [result] = reconcileItemsWithAsset([other] as never, asset());
    expect(result).toEqual(other);
  });

  // Red if params are not normalised or clampedParams is not set for the clamped keys.
  it("normalises params of this asset's items and sets clampedParams", () => {
    const item = { ...buildValidItem(), params: { width: 99, bogus: 1 } };
    const [result] = reconcileItemsWithAsset([item] as never, asset()) as Array<
      typeof item & { clampedParams?: string[] }
    >;
    expect(result?.params).toEqual({ width: 3, legCount: 4 });
    expect(result?.clampedParams).toEqual(["width"]);
  });

  // Red if clampedParams is left stale instead of cleared when nothing needs clamping.
  it("clears a stale clampedParams when nothing is clamped", () => {
    const item = { ...buildValidItem(), clampedParams: ["width"] };
    const [result] = reconcileItemsWithAsset([item] as never, asset()) as Array<
      typeof item & { clampedParams?: string[] }
    >;
    expect(result?.clampedParams ?? []).toEqual([]);
  });

  // Red if order or other item fields (position, rotation, flags) change.
  it("preserves order and non-param fields", () => {
    const a = { ...buildValidItem(), id: "item_a", x: 3, params: { width: 99 } };
    const b = { ...buildValidItem(), id: "item_b", assetId: "asset_other" };
    const c = { ...buildValidItem(), id: "item_c", locked: true };
    const result = reconcileItemsWithAsset([a, b, c] as never, asset());
    expect(result.map((item) => item.id)).toEqual(["item_a", "item_b", "item_c"]);
    expect(result[0]).toMatchObject({ x: 3, z: a.z, rotation: a.rotation, locked: false });
    expect(result[1]).toEqual(b);
    expect(result[2]).toMatchObject({ locked: true });
  });

  // Red if the input items are mutated.
  it("does not mutate its input", () => {
    const item = { ...buildValidItem(), params: { width: 99 } };
    reconcileItemsWithAsset([item] as never, asset());
    expect(item.params).toEqual({ width: 99 });
    expect("clampedParams" in item).toBe(false);
  });
});

describe("resolveAsset", () => {
  // Red if formulas are not evaluated against param values.
  it("evaluates formulas against the given param values", () => {
    const { parts, issues } = resolveAsset(buildValidAsset() as never, { width: 2.4, legCount: 2 });
    const seat = parts.find((part) => part.id === "part_seat");
    expect(seat?.w).toBe(2.4);
    expect(seat?.h).toBe(0.15);
    expect(issues).toEqual([]);
  });

  // Red if defaults are not used when values are omitted.
  it("uses param defaults when values are omitted", () => {
    const { parts } = resolveAsset(buildValidAsset() as never);
    expect(parts.find((part) => part.id === "part_seat")?.w).toBe(1.8);
    expect(parts.filter((part) => part.id.startsWith("part_leg#"))).toHaveLength(4);
  });

  // Red if values are not normalised (clamped) before the scope is built.
  it("clamps out-of-range values before evaluating", () => {
    const { parts } = resolveAsset(buildValidAsset() as never, { width: 99, legCount: 4 });
    expect(parts.find((part) => part.id === "part_seat")?.w).toBe(3);
  });

  // Red if i / count are not in scope or ids do not follow <partId>#<i>.
  it("repeats parts with i and count in scope and ids <partId>#<i>", () => {
    const { parts, issues } = resolveAsset(buildValidAsset() as never, { width: 1.8, legCount: 3 });
    const legs = parts.filter((part) => part.id.startsWith("part_leg"));
    expect(legs.map((leg) => leg.id)).toEqual(["part_leg#0", "part_leg#1", "part_leg#2"]);
    // x = -width/2 + 0.1 + i*(width-0.2)/max(count-1,1) with width 1.8, count 3
    expect(legs[0]?.x).toBeCloseTo(-0.8, 10);
    expect(legs[1]?.x).toBeCloseTo(0, 10);
    expect(legs[2]?.x).toBeCloseTo(0.8, 10);
    expect(parts.some((part) => part.id === "part_leg")).toBe(false);
    expect(issues).toEqual([]);
  });

  // Red if non-repeated parts get a "#" suffix.
  it("keeps the plain id for parts without repeat", () => {
    const { parts } = resolveAsset(buildValidAsset() as never);
    expect(parts.some((part) => part.id === "part_seat")).toBe(true);
    expect(parts.some((part) => part.id.startsWith("part_seat#"))).toBe(false);
  });

  // Red if the repeat count is rounded or truncated wrongly (2.9 -> 2, not 3).
  it("floors the repeat count", () => {
    const asset = buildAssetWith([buildBox({ repeat: { count: "=2.9" } })]);
    expect(resolveAsset(asset as never).parts.map((part) => part.id)).toEqual([
      "part_box#0",
      "part_box#1",
    ]);
  });

  // Red if the cap is missing, different from 200, or off by one.
  it("caps the repeat count at 200", () => {
    const over = buildAssetWith([buildBox({ repeat: { count: 500 } })]);
    const exact = buildAssetWith([buildBox({ repeat: { count: 200 } })]);
    const result = resolveAsset(over as never).parts;
    expect(result).toHaveLength(200);
    expect(result[199]?.id).toBe("part_box#199");
    expect(resolveAsset(exact as never).parts).toHaveLength(200);
  });

  // Red if `count` in the scope is the raw value instead of the effective (floored) one.
  it("exposes the effective repeat count to formulas", () => {
    const asset = buildAssetWith([buildBox({ x: "=count*10 + i", repeat: { count: "=2.9" } })]);
    const xs = resolveAsset(asset as never).parts.map((part) => part.x);
    expect(xs).toEqual([20, 21]);
  });

  // Red if a zero repeat count still emits a part.
  it("emits no parts for a repeat count of 0", () => {
    const asset = buildAssetWith([buildBox({ repeat: { count: 0 } }), buildBox({ id: "part_two" })]);
    expect(resolveAsset(asset as never).parts.map((part) => part.id)).toEqual(["part_two"]);
  });

  // Red if pi is missing from the scope.
  it("provides pi in the scope", () => {
    const asset = buildAssetWith([buildBox({ x: "=pi" })]);
    expect(resolveAsset(asset as never).parts[0]?.x).toBeCloseTo(Math.PI, 10);
  });

  // Red if a failing position field is not 0, or no issue with partId and field is reported.
  it("turns a failing position field into 0 plus an issue with partId and field", () => {
    const asset = buildAssetWith([buildBox({ x: "=1/0" })]);
    const { parts, issues } = resolveAsset(asset as never);
    expect(parts[0]?.x).toBe(0);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ partId: "part_box", field: "x" });
    expect(typeof issues[0]?.error.message).toBe("string");
    expect(typeof issues[0]?.error.position).toBe("number");
  });

  // Red if failing size fields fall back to 0 instead of 0.01, or bevel/rotation not to 0.
  it("falls back to 0.01 for failing size fields and 0 for the rest", () => {
    const asset = buildAssetWith([
      buildBox({ w: "=nope", h: "=(", d: "=1/0", bevel: "=nope", rx: "=nope", y: "=nope" }),
    ]);
    const { parts, issues } = resolveAsset(asset as never);
    expect(parts[0]).toMatchObject({ w: 0.01, h: 0.01, d: 0.01, bevel: 0, rx: 0, y: 0 });
    expect(issues.map((issue) => issue.field).sort()).toEqual(["bevel", "d", "h", "rx", "w", "y"]);
  });

  // Red if one failing part prevents other parts from resolving.
  it("keeps resolving other parts when one fails", () => {
    const asset = buildAssetWith([
      buildBox({ id: "part_bad", w: "=nope" }),
      buildBox({ id: "part_good", w: 2 }),
    ]);
    const { parts, issues } = resolveAsset(asset as never);
    expect(parts.find((part) => part.id === "part_good")?.w).toBe(2);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.partId === "part_bad")).toBe(true);
  });

  // Red if resolution throws on broken input (unknown identifier, bad repeat, prototype names).
  it("never throws, even for a broken repeat count or prototype-chain identifiers", () => {
    const asset = buildAssetWith([
      buildBox({ id: "part_a", repeat: { count: "=nope" }, x: "=constructor" }),
      buildBox({ id: "part_b", x: "=__proto__" }),
    ]);
    expect(() => resolveAsset(asset as never)).not.toThrow();
    const { issues } = resolveAsset(asset as never);
    expect(issues.length).toBeGreaterThan(0);
  });

  // Red if resolved numeric fields stay as formula strings.
  it("returns plain numbers for every numeric field", () => {
    const { parts } = resolveAsset(buildValidAsset() as never);
    for (const part of parts) {
      for (const field of ["x", "y", "z", "rx", "ry", "rz", "w", "h", "d", "bevel"] as const) {
        expect(typeof part[field]).toBe("number");
      }
    }
  });

  // Red if non-numeric part fields (shape, material) are dropped.
  it("carries over non-numeric fields", () => {
    const seat = resolveAsset(buildValidAsset() as never).parts.find((part) => part.id === "part_seat");
    expect(seat).toMatchObject({ shape: "box", name: "Sitzfläche", materialId: "mat_oak" });
  });

  // Red if the input asset is mutated.
  it("does not mutate the asset", () => {
    const asset = buildValidAsset();
    resolveAsset(asset as never, { width: 2 });
    expect(asset).toEqual(buildValidAsset());
  });

  describe("boundingBox", () => {
    // Red if the union over parts is wrong (e.g. only first part, or ignores y).
    it("is the union of all parts' boxes", () => {
      const { boundingBox } = resolveAsset(buildValidAsset() as never);
      // seat dominates x/z (w=1.8, d=0.9); y spans legs (0) to seat top (0.4 + 0.075)
      expect(boundingBox.min[0]).toBeCloseTo(-0.9, 10);
      expect(boundingBox.min[1]).toBeCloseTo(0, 10);
      expect(boundingBox.min[2]).toBeCloseTo(-0.45, 10);
      expect(boundingBox.max[0]).toBeCloseTo(0.9, 10);
      expect(boundingBox.max[1]).toBeCloseTo(0.475, 10);
      expect(boundingBox.max[2]).toBeCloseTo(0.45, 10);
    });

    // Red if part offsets are ignored or only one side of the union is taken.
    it("honours part positions across several parts", () => {
      const asset = buildAssetWith([
        buildBox({ id: "part_a", x: -2, w: 1, h: 1, d: 1 }),
        buildBox({ id: "part_b", x: 3, y: 2, z: 1, w: 2, h: 2, d: 2 }),
      ]);
      const { boundingBox } = resolveAsset(asset as never);
      expect(boundingBox.min).toEqual([-2.5, -0.5, -0.5]);
      expect(boundingBox.max).toEqual([4, 3, 2]);
    });

    // Red if rotation is ignored: 1x1x1 box rotated 45 deg about y has x half-extent sqrt(2)/2.
    it("accounts for rotation about y", () => {
      const asset = buildAssetWith([buildBox({ ry: 45 })]);
      const { boundingBox } = resolveAsset(asset as never);
      const half = Math.SQRT2 / 2;
      expect(boundingBox.min[0]).toBeCloseTo(-half, 10);
      expect(boundingBox.max[0]).toBeCloseTo(half, 10);
      expect(boundingBox.min[2]).toBeCloseTo(-half, 10);
      expect(boundingBox.max[2]).toBeCloseTo(half, 10);
      expect(boundingBox.min[1]).toBeCloseTo(-0.5, 10);
      expect(boundingBox.max[1]).toBeCloseTo(0.5, 10);
    });

    // Red if rotation is applied in radians-as-degrees or rotation axes are mixed up.
    it("accounts for rotation about x and z", () => {
      const rx = resolveAsset(buildAssetWith([buildBox({ rx: 45 })]) as never).boundingBox;
      expect(rx.max[0]).toBeCloseTo(0.5, 10);
      expect(rx.max[1]).toBeCloseTo(Math.SQRT2 / 2, 10);
      expect(rx.max[2]).toBeCloseTo(Math.SQRT2 / 2, 10);

      const rz = resolveAsset(buildAssetWith([buildBox({ rz: 45 })]) as never).boundingBox;
      expect(rz.max[0]).toBeCloseTo(Math.SQRT2 / 2, 10);
      expect(rz.max[1]).toBeCloseTo(Math.SQRT2 / 2, 10);
      expect(rz.max[2]).toBeCloseTo(0.5, 10);
    });

    // Red if a 90 deg rotation does not swap extents of a non-cubic box.
    it("swaps extents for a 90 degree rotation about y", () => {
      const asset = buildAssetWith([buildBox({ w: 2, d: 1, ry: 90 })]);
      const { boundingBox } = resolveAsset(asset as never);
      expect(boundingBox.max[0]).toBeCloseTo(0.5, 10);
      expect(boundingBox.max[2]).toBeCloseTo(1, 10);
    });

    // Red if the rotation pivots around the origin instead of the part centre.
    it("rotates around the part centre, not the origin", () => {
      const asset = buildAssetWith([buildBox({ x: 5, ry: 45 })]);
      const { boundingBox } = resolveAsset(asset as never);
      const half = Math.SQRT2 / 2;
      expect(boundingBox.min[0]).toBeCloseTo(5 - half, 10);
      expect(boundingBox.max[0]).toBeCloseTo(5 + half, 10);
    });

    // Red if repeated copies are left out of the union.
    it("includes repeated copies", () => {
      const asset = buildAssetWith([buildBox({ x: "=i*10", repeat: { count: 3 } })]);
      const { boundingBox } = resolveAsset(asset as never);
      expect(boundingBox.min[0]).toBeCloseTo(-0.5, 10);
      expect(boundingBox.max[0]).toBeCloseTo(20.5, 10);
    });

    // Red if fallback sizes of failed fields are not used in the box (0.01 size).
    it("uses fallback values of failed fields", () => {
      const asset = buildAssetWith([buildBox({ w: "=nope" })]);
      const { boundingBox } = resolveAsset(asset as never);
      expect(boundingBox.max[0]).toBeCloseTo(0.005, 10);
      expect(boundingBox.min[0]).toBeCloseTo(-0.005, 10);
    });
  });
});

describe("assetFootprint", () => {
  // Red if half extents, centre or y range are derived wrongly from the bounding box.
  it("derives half extents, centre and y range from the bounding box", () => {
    const asset = buildAssetWith([
      buildBox({ id: "part_a", x: 1, z: -1, y: 1, w: 2, h: 2, d: 2 }),
      buildBox({ id: "part_b", x: 2, z: 0, y: 0.5, w: 2, h: 1, d: 2 }),
    ]);
    // union: x [0, 3], y [0, 2], z [-2, 1]
    const footprint = assetFootprint(resolveAsset(asset as never));
    expect(footprint.halfWidth).toBeCloseTo(1.5, 10);
    expect(footprint.halfDepth).toBeCloseTo(1.5, 10);
    expect(footprint.centerX).toBeCloseTo(1.5, 10);
    expect(footprint.centerZ).toBeCloseTo(-0.5, 10);
    expect(footprint.minY).toBeCloseTo(0, 10);
    expect(footprint.maxY).toBeCloseTo(2, 10);
  });

  // Red if width and depth are swapped.
  it("keeps width on x and depth on z", () => {
    const asset = buildAssetWith([buildBox({ w: 4, d: 2 })]);
    const footprint = assetFootprint(resolveAsset(asset as never));
    expect(footprint.halfWidth).toBeCloseTo(2, 10);
    expect(footprint.halfDepth).toBeCloseTo(1, 10);
    expect(footprint.centerX).toBeCloseTo(0, 10);
    expect(footprint.centerZ).toBeCloseTo(0, 10);
  });
});
