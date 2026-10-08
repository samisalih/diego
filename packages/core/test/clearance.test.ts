import { describe, expect, it } from "vitest";
import {
  assetFootprint,
  itemClearances,
  itemObb,
  resolveAsset,
  type Asset,
  type DocumentContent,
  type Item,
  type Opening,
  type Wall,
} from "../src/index.ts";
import { SEED_ASSETS, SEED_DOCUMENT } from "../src/seed/index.ts";

// Contract (docs/specs/editor.md section 6.1), with these readings of what the spec leaves open:
// - signature: itemClearances(content: DocumentContent, assets: Asset[], itemId: string)
// - sides are in the item's local frame: front = local +z, back = local -z, right = local +x, left = local -x
//   (local x axis = (cos a, -sin a), local z axis = (sin a, cos a), like itemObb)
// - `from` is the midpoint of the side, `to` is the hit point on the wall face, `distance` = |to - from|
// - an unknown item id yields an empty list

const assets: Asset[] = SEED_ASSETS;
const TABLE = SEED_ASSETS.find((asset) => asset.id === "asset_dining_table")!;
const THICKNESS = 0.2;

function wall(id: string, startX: number, startZ: number, endX: number, endZ: number): Wall {
  return { id, startX, startZ, endX, endZ, thickness: THICKNESS, exterior: true };
}

function contentWith(walls: Wall[], items: Item[], openings: Opening[] = []): DocumentContent {
  const { id: _id, source: _source, ...content } = structuredClone(SEED_DOCUMENT);
  return { ...content, apartment: { ...content.apartment, rooms: [], walls, openings }, items };
}

function tableAt(x: number, z: number, rotation = 0): Item {
  return { id: "item_probe", assetId: TABLE.id, name: null, x, z, rotation, params: {}, locked: false, hidden: false, lightOn: false };
}

function obbOf(item: Item, assetList: Asset[] = assets) {
  const asset = assetList.find((candidate) => candidate.id === item.assetId)!;
  return itemObb(item, assetFootprint(resolveAsset(asset, item.params)));
}

// Local axes and the midpoint of one side, derived from the OBB (independent of the implementation under test).
function sideMidpoint(item: Item, side: "front" | "back" | "left" | "right"): [number, number] {
  const obb = obbOf(item);
  const angle = (item.rotation * Math.PI) / 180;
  const axisX = [Math.cos(angle), -Math.sin(angle)] as const;
  const axisZ = [Math.sin(angle), Math.cos(angle)] as const;
  const sides: Record<typeof side, { axis: readonly [number, number]; half: number; sign: number }> = {
    front: { axis: axisZ, half: obb.hz, sign: 1 },
    back: { axis: axisZ, half: obb.hz, sign: -1 },
    right: { axis: axisX, half: obb.hx, sign: 1 },
    left: { axis: axisX, half: obb.hx, sign: -1 },
  };
  const { axis, half, sign } = sides[side];
  return [obb.cx + axis[0] * half * sign, obb.cz + axis[1] * half * sign];
}

const bySide = (entries: ReturnType<typeof itemClearances>, side: string) => entries.find((entry) => entry.side === side);

describe("itemClearances", () => {
  // A closed box of four walls around the item, wall faces at x = -4.9 / 3.9 and z = 0.1 / 5.9.
  const room = [
    wall("wall_n", -5, 0, 4, 0),
    wall("wall_s", -5, 6, 4, 6),
    wall("wall_w", -5, 0, -5, 6),
    wall("wall_e", 4, 0, 4, 6),
  ];

  describe("axis-aligned item in a closed room", () => {
    const item = tableAt(-0.5, 3);
    const entries = itemClearances(contentWith(room, [item]), assets, item.id);

    // Red if a side is skipped or the sides are mapped to the wrong local axis.
    it("returns one entry per side with the wall that is hit", () => {
      expect(entries.map((entry) => entry.side).sort()).toEqual(["back", "front", "left", "right"]);
      expect(bySide(entries, "front")!.wallId).toBe("wall_s");
      expect(bySide(entries, "back")!.wallId).toBe("wall_n");
      expect(bySide(entries, "left")!.wallId).toBe("wall_w");
      expect(bySide(entries, "right")!.wallId).toBe("wall_e");
    });

    // Red if the distance is measured to the centre line instead of the wall face, or from the item centre.
    it("measures from the side midpoint to the wall face", () => {
      const obb = obbOf(item);
      expect(bySide(entries, "front")!.distance).toBeCloseTo(5.9 - (obb.cz + obb.hz), 6);
      expect(bySide(entries, "back")!.distance).toBeCloseTo(obb.cz - obb.hz - 0.1, 6);
      expect(bySide(entries, "right")!.distance).toBeCloseTo(3.9 - (obb.cx + obb.hx), 6);
      expect(bySide(entries, "left")!.distance).toBeCloseTo(obb.cx - obb.hx + 4.9, 6);
    });

    // Red if from/to are not the side midpoint and the hit point on the face.
    it("reports from (side midpoint) and to (hit point on the wall face)", () => {
      const front = bySide(entries, "front")!;
      const [fromX, fromZ] = sideMidpoint(item, "front");
      expect(front.from[0]).toBeCloseTo(fromX, 6);
      expect(front.from[1]).toBeCloseTo(fromZ, 6);
      expect(front.to[0]).toBeCloseTo(fromX, 6);
      expect(front.to[1]).toBeCloseTo(5.9, 6);
      for (const entry of entries) {
        expect(Math.hypot(entry.to[0] - entry.from[0], entry.to[1] - entry.from[1])).toBeCloseTo(entry.distance, 6);
      }
    });
  });

  describe("rotated items", () => {
    // Red if the rotation is ignored: at 90 degrees the front (local +z) faces east and the right side (local +x) faces north.
    it("maps sides through the item rotation (90 degrees)", () => {
      const item = tableAt(-0.5, 3, 90);
      const entries = itemClearances(contentWith(room, [item]), assets, item.id);
      const obb = obbOf(item);
      expect(bySide(entries, "front")!.wallId).toBe("wall_e");
      expect(bySide(entries, "front")!.distance).toBeCloseTo(3.9 - (obb.cx + obb.hz), 6);
      expect(bySide(entries, "back")!.wallId).toBe("wall_w");
      expect(bySide(entries, "right")!.wallId).toBe("wall_n");
      expect(bySide(entries, "right")!.distance).toBeCloseTo(obb.cz - obb.hx - 0.1, 6);
      expect(bySide(entries, "left")!.wallId).toBe("wall_s");
    });
  });

  describe("seed apartment", () => {
    const content = SEED_DOCUMENT as unknown as DocumentContent;
    const seedItem = (id: string) => SEED_DOCUMENT.items.find((candidate) => candidate.id === id)!;

    // Red if a ray stops at the wrong wall: each side of the bed hits a different wall (north, west, hallway, living wall).
    it("finds the four walls around the bed", () => {
      const entries = itemClearances(content, assets, "item_bed");
      const obb = obbOf(seedItem("item_bed"));
      expect(bySide(entries, "back")!.wallId).toBe("wall_north");
      expect(bySide(entries, "back")!.distance).toBeCloseTo(obb.cz - obb.hz - 0.36, 6);
      expect(bySide(entries, "left")!.wallId).toBe("wall_west");
      expect(bySide(entries, "left")!.distance).toBeCloseTo(obb.cx - obb.hx - 0.36, 6);
      expect(bySide(entries, "right")!.wallId).toBe("wall_hallway_west");
      expect(bySide(entries, "right")!.distance).toBeCloseTo(5.045 - (obb.cx + obb.hx), 6);
      expect(bySide(entries, "front")!.wallId).toBe("wall_bedroom_living");
      expect(bySide(entries, "front")!.distance).toBeCloseTo(3.295 - (obb.cz + obb.hz), 6);
    });

    // Red if rotation 270 is mishandled (front must face west), or if the window span in wall_west stops the ray:
    // the shelf front ray at z = 5.6 passes through opening_living_window_west and still hits wall_west.
    it("handles the shelf rotated 270 degrees and ignores openings in the hit wall", () => {
      const entries = itemClearances(content, assets, "item_shelf");
      const obb = obbOf(seedItem("item_shelf"));
      expect(bySide(entries, "front")!.wallId).toBe("wall_west");
      expect(bySide(entries, "front")!.distance).toBeCloseTo(obb.cx - obb.hz - 0.36, 6);
      expect(bySide(entries, "back")!.wallId).toBe("wall_hallway_west");
      expect(bySide(entries, "back")!.distance).toBeCloseTo(5.045 - (obb.cx + obb.hz), 6);
      expect(bySide(entries, "left")!.wallId).toBe("wall_bedroom_living");
      expect(bySide(entries, "right")!.wallId).toBe("wall_south");
      expect(bySide(entries, "right")!.distance).toBeCloseTo(7 - (obb.cz + obb.hx), 6);
    });
  });

  describe("openings and range", () => {
    const item = tableAt(0, 3);
    const nearWall = wall("wall_near", -3, 0, -3, 6);
    const farWall = wall("wall_far", -6, 0, -6, 6);
    // Door span from z = 2 to z = 4 in the near wall (offsets count from the wall start at z = 0).
    const door: Opening = { id: "opening_probe", wallId: "wall_near", type: "door", offsetFromStart: 2, width: 2, height: 2.1, sillHeight: 0, frameMaterialId: null } as Opening;

    // Red if the near wall stops a ray that passes through its door span (openings must be ignored for the hit test).
    it("lets a ray pass through an opening span in the wall it hits and reports that wall", () => {
      const entries = itemClearances(contentWith([nearWall, farWall], [item], [door]), assets, item.id);
      expect(entries).toHaveLength(1);
      const left = bySide(entries, "left")!;
      expect(left.wallId).toBe("wall_near");
      expect(left.to[0]).toBeCloseTo(-2.9, 6);
    });

    // Red if the next wall behind an opening is never considered: the walls are looked up independently of openings.
    it("hits the nearest wall face when the ray does not meet any opening", () => {
      const entries = itemClearances(contentWith([nearWall, farWall], [item]), assets, item.id);
      expect(entries).toHaveLength(1);
      expect(bySide(entries, "left")!.wallId).toBe("wall_near");
    });

    // Red if a missed ray still yields an entry: an item with walls on one side only gets one entry, a free item none.
    it("omits sides without a wall hit", () => {
      expect(itemClearances(contentWith([], [item]), assets, item.id)).toEqual([]);
      expect(itemClearances(contentWith([wall("wall_n", -5, 0, 5, 0)], [item]), assets, item.id).map((entry) => entry.side)).toEqual(["back"]);
    });

    // Red if the 20 m cap is dropped or applied to the wrong distance: face at 19.5 m is hit, at 20.5 m it is not.
    it("ignores walls further than 20 m from the side midpoint", () => {
      const obb = obbOf(item);
      const wallAt = (distance: number) => wall("wall_range", obb.cx - obb.hx - distance - THICKNESS / 2, -5, obb.cx - obb.hx - distance - THICKNESS / 2, 10);
      const within = itemClearances(contentWith([wallAt(19.5)], [item]), assets, item.id);
      expect(bySide(within, "left")!.distance).toBeCloseTo(19.5, 6);
      expect(itemClearances(contentWith([wallAt(20.5)], [item]), assets, item.id)).toEqual([]);
    });

    // Red if the item sits outside every wall and still gets entries (rays point away from the walls).
    it("returns fewer entries for an item outside all walls", () => {
      const outside = tableAt(30, 3);
      const entries = itemClearances(contentWith(room, [outside]), assets, outside.id);
      expect(entries.length).toBeLessThan(4);
      expect(entries.every((entry) => entry.distance <= 20)).toBe(true);
    });

    // Red if an unknown id throws instead of returning nothing.
    it("returns an empty list for an unknown item id", () => {
      expect(itemClearances(contentWith(room, [item]), assets, "item_missing")).toEqual([]);
    });
  });
});
