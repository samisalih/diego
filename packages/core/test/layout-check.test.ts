// Layout check tests (docs/specs/core.md section 8).
// All scenes use one 10 m x 10 m room (0..10) and one local box asset with params width/depth/height
// (default 1 m each). Walls and openings are added per test, so unrelated issue kinds stay out of the way.
import { describe, expect, it } from "vitest";
import { checkLayout } from "../src/layout-check.ts";
import type { LayoutIssue } from "../src/layout-check.ts";
import type { Asset } from "../src/schemas/asset.ts";
import type { DocumentContent } from "../src/schemas/document.ts";

const BOX_ASSET_ID = "asset_box";

function buildBoxAsset(): Asset {
  const param = (key: string, max: number) => ({ key, label: key, min: 0.1, max, step: 0.01, default: 1, unit: "m" as const });
  return {
    id: BOX_ASSET_ID,
    name: "Box",
    category: "Test",
    params: [param("width", 5), param("depth", 5), param("height", 3)],
    parts: [
      {
        id: "part_box",
        name: "Box",
        shape: "box",
        x: 0,
        y: "=height/2",
        z: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        w: "=width",
        h: "=height",
        d: "=depth",
        bevel: 0,
      },
    ],
    referenceImages: {},
  } as Asset;
}

const assets = new Map<string, Asset>([[BOX_ASSET_ID, buildBoxAsset()]]);

type ItemOptions = {
  width?: number;
  depth?: number;
  height?: number;
  rotation?: number;
  hidden?: boolean;
  assetId?: string;
  clampedParams?: string[];
  params?: Record<string, number>;
};

function buildItem(id: string, x: number, z: number, options: ItemOptions = {}) {
  const { width = 1, depth = 1, height = 1, rotation = 0, hidden = false, assetId = BOX_ASSET_ID, clampedParams, params } = options;
  return {
    id,
    assetId,
    name: null,
    x,
    z,
    rotation,
    params: params ?? { width, depth, height },
    locked: false,
    hidden,
    lightOn: false,
    ...(clampedParams ? { clampedParams } : {}),
  };
}

function buildWall(id: string, start: [number, number], end: [number, number], exterior: boolean) {
  return { id, startX: start[0], startZ: start[1], endX: end[0], endZ: end[1], thickness: 0.2, exterior };
}

function buildOpening(
  id: string,
  wallId: string,
  type: "window" | "door" | "balconyDoor",
  offsetFromStart: number,
  width: number,
) {
  const isWindow = type === "window";
  return { id, wallId, type, offsetFromStart, width, height: isWindow ? 1.2 : 2.1, sillHeight: isWindow ? 0.9 : 0 };
}

function buildScene(
  items: ReturnType<typeof buildItem>[],
  walls: ReturnType<typeof buildWall>[] = [],
  openings: ReturnType<typeof buildOpening>[] = [],
): DocumentContent {
  return {
    name: "Layout test",
    apartment: {
      meta: { name: "Test", ceilingHeight: 2.6, northAngle: 0, latitude: 52.5, longitude: 13.4, timeZone: "Europe/Berlin" },
      rooms: [
        {
          id: "room_main",
          name: "Raum",
          polygon: [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
          ],
        },
      ],
      walls,
      openings,
    },
    items,
    lighting: { time: 12, season: "summer", effectsEnabled: false, lampShadowsEnabled: false },
  } as unknown as DocumentContent;
}

const ofKind = (issues: LayoutIssue[], kind: LayoutIssue["kind"]) => issues.filter((issue) => issue.kind === kind);
const splitKeys = (detail: string | null) => (detail ?? "").split(/,\s*/).filter(Boolean).sort();
const pairOf = (issue: LayoutIssue) => [issue.subjectId, issue.objectId].sort();

describe("checkLayout baseline", () => {
  // Red if the check reports issues for a clean scene (items far apart, inside the room, default params).
  it("returns no issues for a clean scene", () => {
    const scene = buildScene([buildItem("item_a", 3, 3), buildItem("item_b", 7, 7)]);
    expect(checkLayout(scene, assets)).toEqual([]);
  });
});

describe("collision", () => {
  // Red if item pairs are not detected or ids are not sorted (item_b is listed first on purpose).
  it("reports an item-item overlap with sorted ids", () => {
    const scene = buildScene([buildItem("item_b", 5.5, 5), buildItem("item_a", 5, 5)]);
    const collisions = ofKind(checkLayout(scene, assets), "collision");
    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toMatchObject({ subjectId: "item_a", objectId: "item_b" });
  });

  it("reports no collision for items that only touch", () => {
    const scene = buildScene([buildItem("item_a", 5, 5), buildItem("item_b", 6, 5)]);
    expect(ofKind(checkLayout(scene, assets), "collision")).toEqual([]);
  });

  // Red if the item rotation is ignored: unrotated, the plank spans x 4..6 / z 4.8..5.2 and misses the box.
  it("uses the item rotation for the footprint", () => {
    const plank = buildItem("item_plank", 5, 5, { width: 2, depth: 0.4, rotation: 90 });
    const box = buildItem("item_box", 5, 6.4);
    const collisions = ofKind(checkLayout(buildScene([plank, box]), assets), "collision");
    expect(collisions).toHaveLength(1);
    expect(pairOf(collisions[0]!)).toEqual(["item_box", "item_plank"]);
  });

  // Red if walls are not part of the collision check. Wall z -0.1..0.1, item z -0.2..0.8.
  it("reports an item overlapping a wall", () => {
    const scene = buildScene([buildItem("item_a", 5, 0.3)], [buildWall("wall_n", [0, 0], [10, 0], true)]);
    const collisions = ofKind(checkLayout(scene, assets), "collision");
    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toMatchObject({ subjectId: "item_a", objectId: "wall_n" });
  });

  // Red if the opening span is not excluded. Door spans x 4..5, the item (x 4.2..4.8) stands in it.
  it("reports no wall collision for an item standing inside a door opening span", () => {
    const wall = buildWall("wall_n", [0, 0], [10, 0], true);
    const door = buildOpening("opening_door", "wall_n", "door", 4, 1);
    const inside = buildItem("item_a", 4.5, 0.2, { width: 0.6, depth: 0.6, height: 0.5 });
    expect(ofKind(checkLayout(buildScene([inside], [wall], [door]), assets), "collision")).toEqual([]);
  });

  // Control for the test above: same item and wall without the opening collides.
  it("reports the wall collision for the same item without an opening", () => {
    const wall = buildWall("wall_n", [0, 0], [10, 0], true);
    const item = buildItem("item_a", 4.5, 0.2, { width: 0.6, depth: 0.6, height: 0.5 });
    expect(ofKind(checkLayout(buildScene([item], [wall]), assets), "collision")).toHaveLength(1);
  });

  // Red if an item that extends beyond the opening span is excused (x 3.8..5.2, door spans x 4..5).
  it("reports a wall collision when the item overlaps the wall beyond the opening span", () => {
    const wall = buildWall("wall_n", [0, 0], [10, 0], true);
    const door = buildOpening("opening_door", "wall_n", "door", 4, 1);
    const wide = buildItem("item_a", 4.5, 0.2, { width: 1.4, depth: 0.6, height: 0.5 });
    const collisions = ofKind(checkLayout(buildScene([wide], [wall], [door]), assets), "collision");
    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toMatchObject({ subjectId: "item_a", objectId: "wall_n" });
  });
});

describe("narrowPassage", () => {
  // Items 1 m wide at x=3 (2.5..3.5) and x=3+1+gap.
  const itemsWithGap = (gap: number, zShift = 0) => [
    buildItem("item_a", 3, 3),
    buildItem("item_b", 4 + gap, 3 + zShift),
  ];

  // Red if the gap or the value is wrong.
  it("reports two items with a gap between 0.3 and 0.8 m, with the gap as value", () => {
    const passages = ofKind(checkLayout(buildScene(itemsWithGap(0.5)), assets), "narrowPassage");
    expect(passages).toHaveLength(1);
    expect(pairOf(passages[0]!)).toEqual(["item_a", "item_b"]);
    expect(passages[0]!.value).toBeCloseTo(0.5, 6);
  });

  it("reports the gap at both edges of the range", () => {
    const low = ofKind(checkLayout(buildScene(itemsWithGap(0.31)), assets), "narrowPassage");
    const high = ofKind(checkLayout(buildScene(itemsWithGap(0.79)), assets), "narrowPassage");
    expect(low).toHaveLength(1);
    expect(high).toHaveLength(1);
    expect(high[0]!.value).toBeCloseTo(0.79, 6);
  });

  // Red if the lower bound is dropped (a gap below 0.3 m is not a passage, nobody walks through).
  it("reports nothing below 0.3 m", () => {
    expect(ofKind(checkLayout(buildScene(itemsWithGap(0.29)), assets), "narrowPassage")).toEqual([]);
  });

  // Red if the upper bound is inclusive or dropped.
  it("reports nothing at 0.8 m or wider", () => {
    expect(ofKind(checkLayout(buildScene(itemsWithGap(0.81)), assets), "narrowPassage")).toEqual([]);
    expect(ofKind(checkLayout(buildScene(itemsWithGap(0.8)), assets), "narrowPassage")).toEqual([]);
  });

  // Red if the facing-overlap requirement is dropped: shifted by 0.8 m in z the faces overlap 0.2 m only.
  it("reports nothing when the facing sides overlap by less than 0.3 m", () => {
    expect(ofKind(checkLayout(buildScene(itemsWithGap(0.5, 0.8)), assets), "narrowPassage")).toEqual([]);
  });

  it("reports the facing overlap of 0.5 m as a passage", () => {
    expect(ofKind(checkLayout(buildScene(itemsWithGap(0.5, 0.5)), assets), "narrowPassage")).toHaveLength(1);
  });

  // Red if walls are not treated as obstacles. Wall face at z=0.1, item z 0.6..1.6, gap 0.5.
  it("reports the gap between an item and a wall", () => {
    const scene = buildScene([buildItem("item_a", 5, 1.1)], [buildWall("wall_n", [0, 0], [10, 0], true)]);
    const passages = ofKind(checkLayout(scene, assets), "narrowPassage");
    expect(passages).toHaveLength(1);
    expect(pairOf(passages[0]!)).toEqual(["item_a", "wall_n"]);
    expect(passages[0]!.value).toBeCloseTo(0.5, 6);
  });

  it("reports no passage for colliding items", () => {
    const scene = buildScene([buildItem("item_a", 5, 5), buildItem("item_b", 5.5, 5)]);
    expect(ofKind(checkLayout(scene, assets), "narrowPassage")).toEqual([]);
  });
});

describe("blockedOpening", () => {
  const interiorWall = buildWall("wall_mid", [5, 0], [5, 10], false);
  const interiorDoor = buildOpening("opening_door", "wall_mid", "door", 4, 1); // z 4..5
  const small = { width: 0.2, depth: 0.2, height: 0.5 };

  // Red if only one side of an interior door is checked.
  it("reports an item on either side of a door in an interior wall", () => {
    const scene = buildScene(
      [buildItem("item_east", 5.5, 4.5, small), buildItem("item_west", 4.5, 4.5, small)],
      [interiorWall],
      [interiorDoor],
    );
    const blocked = ofKind(checkLayout(scene, assets), "blockedOpening");
    expect(blocked.map((issue) => issue.objectId).sort()).toEqual(["item_east", "item_west"]);
    for (const issue of blocked) expect(issue.subjectId).toBe("opening_door");
  });

  // Red if the zone is not limited to 0.8 m depth or to the opening width.
  it("ignores items beyond the clearance depth or beside the opening", () => {
    const scene = buildScene(
      [buildItem("item_far", 6.5, 4.5, small), buildItem("item_beside", 5.5, 7, small)],
      [interiorWall],
      [interiorDoor],
    );
    expect(ofKind(checkLayout(scene, assets), "blockedOpening")).toEqual([]);
  });

  const exteriorWall = buildWall("wall_n", [0, 0], [10, 0], true);
  const exteriorDoor = buildOpening("opening_door", "wall_n", "door", 4, 1); // x 4..5

  it("reports only the room side of a door in an exterior wall", () => {
    const scene = buildScene(
      [buildItem("item_in", 4.5, 0.5, small), buildItem("item_out", 4.5, -0.5, small)],
      [exteriorWall],
      [exteriorDoor],
    );
    const blocked = ofKind(checkLayout(scene, assets), "blockedOpening");
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ subjectId: "opening_door", objectId: "item_in" });
  });

  it("applies the door clearance to balcony doors", () => {
    const balconyDoor = buildOpening("opening_balcony", "wall_n", "balconyDoor", 4, 1);
    const scene = buildScene([buildItem("item_in", 4.5, 0.5, small)], [exteriorWall], [balconyDoor]);
    const blocked = ofKind(checkLayout(scene, assets), "blockedOpening");
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ subjectId: "opening_balcony", objectId: "item_in" });
  });

  const window = buildOpening("opening_window", "wall_n", "window", 4, 1.5); // sill 0.9, x 4..5.5
  const windowItem = (id: string, z: number, height: number) =>
    buildItem(id, 4.75, z, { width: 0.4, depth: 0.2, height });

  // Red if the height rule is dropped: the item top (0.95) is below sill + 0.1 = 1.0.
  it("ignores low items in front of a window", () => {
    const scene = buildScene([windowItem("item_low", 0.3, 0.95)], [exteriorWall], [window]);
    expect(ofKind(checkLayout(scene, assets), "blockedOpening")).toEqual([]);
  });

  // Red if a window is not checked at all: the item top (1.05) is above sill + 0.1.
  it("reports tall items in front of a window", () => {
    const scene = buildScene([windowItem("item_tall", 0.3, 1.05)], [exteriorWall], [window]);
    const blocked = ofKind(checkLayout(scene, assets), "blockedOpening");
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ subjectId: "opening_window", objectId: "item_tall" });
  });

  // Red if the window zone uses the 0.8 m door depth instead of 0.4 m (item z 0.9..1.1).
  it("limits the window clearance to 0.4 m depth", () => {
    const scene = buildScene([windowItem("item_far", 1.0, 1.5)], [exteriorWall], [window]);
    expect(ofKind(checkLayout(scene, assets), "blockedOpening")).toEqual([]);
  });

  it("does not report the outside of an exterior wall for windows", () => {
    const scene = buildScene([windowItem("item_out", -0.3, 1.5)], [exteriorWall], [window]);
    expect(ofKind(checkLayout(scene, assets), "blockedOpening")).toEqual([]);
  });
});

describe("outsideRoom", () => {
  // Red if the centre test is missing or uses the bounding box of rooms.
  it("reports an item whose centre is not inside any room", () => {
    const scene = buildScene([buildItem("item_out", -3, 5), buildItem("item_in", 5, 5)]);
    const outside = ofKind(checkLayout(scene, assets), "outsideRoom");
    expect(outside).toHaveLength(1);
    expect(outside[0]).toMatchObject({ subjectId: "item_out", objectId: null });
  });
});

describe("clampedParam and adjustedParam", () => {
  it("reports the clamped keys as comma-separated detail", () => {
    const scene = buildScene([buildItem("item_a", 5, 5, { clampedParams: ["width", "depth"] })]);
    const clamped = ofKind(checkLayout(scene, assets), "clampedParam");
    expect(clamped).toHaveLength(1);
    expect(clamped[0]).toMatchObject({ subjectId: "item_a", objectId: null, value: null });
    expect(splitKeys(clamped[0]!.detail)).toEqual(["depth", "width"]);
  });

  it("reports nothing when no param was clamped", () => {
    const scene = buildScene([buildItem("item_a", 5, 5, { clampedParams: [] }), buildItem("item_b", 8, 8)]);
    expect(ofKind(checkLayout(scene, assets), "clampedParam")).toEqual([]);
  });

  // Red if the comparison is against something other than the asset defaults (all 1 m).
  it("reports the params that differ from the asset defaults", () => {
    const scene = buildScene([buildItem("item_a", 5, 5, { width: 1.5, height: 2 })]);
    const adjusted = ofKind(checkLayout(scene, assets), "adjustedParam");
    expect(adjusted).toHaveLength(1);
    expect(adjusted[0]).toMatchObject({ subjectId: "item_a", objectId: null, value: null });
    expect(splitKeys(adjusted[0]!.detail)).toEqual(["height", "width"]);
  });

  it("reports nothing for default params, including missing keys", () => {
    const scene = buildScene([buildItem("item_a", 3, 3), buildItem("item_b", 7, 7, { params: { width: 1 } })]);
    expect(ofKind(checkLayout(scene, assets), "adjustedParam")).toEqual([]);
  });
});

describe("unknownAsset", () => {
  // Red if a missing asset throws or is silently skipped.
  it("reports an item whose asset is missing and nothing else for it", () => {
    const scene = buildScene([buildItem("item_ghost", 5, 5, { assetId: "asset_missing" })]);
    const issues = checkLayout(scene, assets);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: "unknownAsset", subjectId: "item_ghost", objectId: null });
  });
});

describe("hidden items", () => {
  // Red if hidden items take part in any check.
  it("are ignored by every check", () => {
    const wall = buildWall("wall_n", [0, 0], [10, 0], true);
    const door = buildOpening("opening_door", "wall_n", "door", 4, 1);
    const scene = buildScene(
      [
        buildItem("item_visible", 5, 5),
        buildItem("item_hidden_overlap", 5.5, 5, { hidden: true }),
        buildItem("item_hidden_outside", -3, 5, { hidden: true }),
        buildItem("item_hidden_ghost", 8, 8, { hidden: true, assetId: "asset_missing" }),
        buildItem("item_hidden_clamped", 8, 3, { hidden: true, clampedParams: ["width"], width: 2 }),
        buildItem("item_hidden_door", 4.5, 0.5, { hidden: true, width: 0.2, depth: 0.2 }),
      ],
      [wall],
      [door],
    );
    expect(checkLayout(scene, assets)).toEqual([]);
  });
});

describe("result ordering", () => {
  // Red if issues are not grouped by kind in spec order, or not sorted by subjectId within a kind.
  it("orders by kind in spec order, then by subjectId", () => {
    const scene = buildScene([
      buildItem("item_ghost", 9, 5, { assetId: "asset_missing" }),
      buildItem("item_clamped", 8, 2, { clampedParams: ["width"] }),
      buildItem("item_adjusted", 8, 8, { width: 1.5 }),
      buildItem("item_out", -3, 5),
      buildItem("item_n2", 3.5, 8),
      buildItem("item_n1", 2, 8),
      buildItem("item_c2", 6.5, 6),
      buildItem("item_c1", 6, 6),
      buildItem("item_a2", 2.5, 2),
      buildItem("item_a1", 2, 2),
    ]);
    const issues = checkLayout(scene, assets);

    expect(issues.map((issue) => issue.kind)).toEqual([
      "collision",
      "collision",
      "narrowPassage",
      "outsideRoom",
      "clampedParam",
      "adjustedParam",
      "unknownAsset",
    ]);
    expect(issues.slice(0, 2).map((issue) => issue.subjectId)).toEqual(["item_a1", "item_c1"]);
  });
});
