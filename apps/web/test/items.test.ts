import { DEGREES_TO_RADIANS, resolveAsset, type Asset, type Item } from "@app/core";
import { SEED_ASSETS, SEED_DOCUMENT } from "../../../packages/core/src/seed/index.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildItemParts } from "../src/scene/build/items.ts";

const assetById = (id: string): Asset => SEED_ASSETS.find((asset) => asset.id === id)!;
const itemById = (id: string): Item => SEED_DOCUMENT.items.find((item) => item.id === id)!;

const sofa = assetById("asset_sofa");
const sofaItem = itemById("item_sofa");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildItemParts", () => {
  // Red if parts are not taken from resolveAsset (ids, repeats, shapes).
  it("returns one entry per resolved part, in resolve order", () => {
    const resolved = resolveAsset(sofa, sofaItem.params).parts;
    const parts = buildItemParts(sofaItem, sofa);
    expect(parts.map((part) => part.partId)).toEqual(resolved.map((part) => part.id));
    expect(parts.map((part) => part.shape)).toEqual(resolved.map((part) => part.shape));
    expect(parts.map((part) => part.materialId)).toEqual(resolved.map((part) => part.materialId ?? null));
  });

  // Red if repeated parts are not expanded (legs repeat 4 times with ids part_legs#0..3).
  it("expands repeated parts into suffixed copies", () => {
    const ids = buildItemParts(sofaItem, sofa).map((part) => part.partId);
    for (let i = 0; i < 4; i += 1) expect(ids).toContain(`part_legs#${i}`);
  });

  // Red if the item params are ignored: three seats by default, four when the slider says so.
  it("honours item params when resolving the asset", () => {
    const four = buildItemParts({ ...sofaItem, params: { seatCount: 4 } }, sofa);
    const three = buildItemParts(sofaItem, sofa);
    const seats = (parts: typeof three) => parts.filter((part) => part.partId.startsWith("part_seat_cushions#")).length;
    expect(seats(three)).toBe(3);
    expect(seats(four)).toBe(4);
  });

  // Red if positions are not the resolved part centres in asset space.
  it("uses the resolved part centre as position", () => {
    const resolved = resolveAsset(sofa, sofaItem.params).parts;
    const parts = buildItemParts(sofaItem, sofa);
    parts.forEach((part, i) => {
      expect(part.position[0]).toBeCloseTo(resolved[i]!.x, 6);
      expect(part.position[1]).toBeCloseTo(resolved[i]!.y, 6);
      expect(part.position[2]).toBeCloseTo(resolved[i]!.z, 6);
    });
  });

  // Red if part rotations stay in degrees or lose an axis (back cushions tilt -8 degrees about x).
  it("converts part rotations from degrees to radians", () => {
    const backCushion = buildItemParts(sofaItem, sofa).find((part) => part.partId === "part_back_cushions#0")!;
    expect(backCushion.rotation[0]).toBeCloseTo(-8 * DEGREES_TO_RADIANS, 6);
    expect(backCushion.rotation[1]).toBeCloseTo(0, 6);
    expect(backCushion.rotation[2]).toBeCloseTo(0, 6);
  });

  // Red if the item transform is baked into the parts (rotation applied twice by the caller's group).
  it("stays in asset space, independent of the item position and rotation", () => {
    const moved: Item = { ...sofaItem, x: 7, z: -3, rotation: 123 };
    expect(buildItemParts(moved, sofa)).toEqual(buildItemParts(sofaItem, sofa));
  });

  // Red if rotation-dependent output sneaks in for a seed item with rotation 270 (shelf).
  it("ignores the rotation of a rotated seed item", () => {
    const shelfItem = itemById("item_shelf");
    const shelf = assetById("asset_shelf");
    expect(shelfItem.rotation).toBe(270);
    expect(buildItemParts(shelfItem, shelf)).toEqual(buildItemParts({ ...shelfItem, rotation: 0 }, shelf));
  });

  // Red if hidden items still produce parts.
  it("skips hidden items", () => {
    expect(buildItemParts({ ...sofaItem, hidden: true }, sofa)).toEqual([]);
  });

  describe("missing asset", () => {
    // Red if a missing asset crashes the scene.
    it("returns no parts and does not throw", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect(buildItemParts({ ...sofaItem, assetId: "asset_gone_a" }, undefined)).toEqual([]);
    });

    // Red if the report is silent or repeated on every render (once per missing asset id).
    it("reports a missing asset once, not on every call", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const item = { ...sofaItem, assetId: "asset_gone_b" };
      buildItemParts(item, undefined);
      buildItemParts(item, undefined);
      buildItemParts({ ...item, id: "item_other" }, undefined);
      expect(warn.mock.calls.length + error.mock.calls.length).toBe(1);
      buildItemParts({ ...item, assetId: "asset_gone_c" }, undefined);
      expect(warn.mock.calls.length + error.mock.calls.length).toBe(2);
    });

    // Red if the hidden check comes after the report (hidden items must stay silent).
    it("does not report a hidden item with a missing asset", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(buildItemParts({ ...sofaItem, assetId: "asset_gone_d", hidden: true }, undefined)).toEqual([]);
      expect(warn.mock.calls.length + error.mock.calls.length).toBe(0);
    });
  });

  describe("geometryKey", () => {
    const keys = (item: Item, asset: Asset) => buildItemParts(item, asset).map((part) => part.geometryKey);
    const keyOf = (item: Item, asset: Asset, partId: string) => buildItemParts(item, asset).find((part) => part.partId === partId)!.geometryKey;

    // Red if keys are not strings or not deterministic.
    it("is a non-empty string, stable across calls", () => {
      const first = keys(sofaItem, sofa);
      expect(first.every((key) => typeof key === "string" && key.length > 0)).toBe(true);
      expect(keys(sofaItem, sofa)).toEqual(first);
    });

    // Red if equal parts do not share one geometry (the four legs differ only in position).
    it("is equal for parts that differ only in position", () => {
      const legKeys = new Set(["part_legs#0", "part_legs#1", "part_legs#2", "part_legs#3"].map((id) => keyOf(sofaItem, sofa, id)));
      expect(legKeys.size).toBe(1);
    });

    // Red if the key ignores geometry-relevant numbers or shape.
    it("differs for parts with a different shape or size", () => {
      const frame = keyOf(sofaItem, sofa, "part_frame");
      const leg = keyOf(sofaItem, sofa, "part_legs#0");
      const cushion = keyOf(sofaItem, sofa, "part_seat_cushions#0");
      expect(new Set([frame, leg, cushion]).size).toBe(3);
    });

    // Red if the size is not part of the key (stale cache after a slider change).
    it("changes when a slider changes the part size", () => {
      expect(keyOf({ ...sofaItem, params: { width: 2.6 } }, sofa, "part_frame")).not.toBe(keyOf(sofaItem, sofa, "part_frame"));
    });

    // Red if the key depends on item identity or placement (cache would never hit).
    it("is equal for the same asset on different items", () => {
      expect(keys({ ...sofaItem, id: "item_second", x: 5, z: 5, rotation: 90 }, sofa)).toEqual(keys(sofaItem, sofa));
    });

    // Red if the key does not contain the shape.
    it("contains the shape name", () => {
      expect(keyOf(sofaItem, sofa, "part_legs#0")).toContain("cylinder");
      expect(keyOf(sofaItem, sofa, "part_frame")).toContain("box");
    });

    // Red if the bevel (geometry-relevant) is dropped from the key: frame bevel 0.03 vs arms bevel 0.04 with otherwise same shape.
    it("changes when the bevel changes", () => {
      const bevelled: Asset = {
        ...sofa,
        parts: sofa.parts.map((part) => (part.id === "part_frame" ? { ...part, bevel: 0.01 } : part)),
      };
      expect(keyOf(sofaItem, bevelled, "part_frame")).not.toBe(keyOf(sofaItem, sofa, "part_frame"));
    });
  });

  // Red if any seed item cannot be built.
  it("builds every seed item with its seed asset", () => {
    for (const item of SEED_DOCUMENT.items) {
      const parts = buildItemParts(item, assetById(item.assetId));
      expect(parts.length, item.id).toBeGreaterThan(0);
      for (const part of parts) {
        expect(part.position.every(Number.isFinite)).toBe(true);
        expect(part.rotation.every(Number.isFinite)).toBe(true);
      }
    }
  });
});
