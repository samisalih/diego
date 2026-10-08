// Geometry tests (docs/specs/core.md section 7).
// Conventions fixed by these tests:
//  - points are [x, z] tuples; polygonCentroid returns [x, z]
//  - openingSegment returns { start: [x, z], end: [x, z] }
//  - Obb = { cx, cz, hx, hz, angle }; the local x axis points to world (cos a, -sin a),
//    the local z axis to (sin a, cos a) (three.js rotation about y, section 3.2)
//  - itemObb(item, footprint): centre = item origin + rotated (centerX, centerZ), hx/hz = half sizes
import { describe, expect, it } from "vitest";
import { itemObb } from "../src/geometry/footprint.ts";
import { obbDistance, obbIntersects, wallObb } from "../src/geometry/obb.ts";
import type { Obb } from "../src/geometry/obb.ts";
import {
  openingSegment,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  roomForPoint,
  wallLength,
} from "../src/geometry/polygon.ts";
import { buildValidApartment } from "./fixtures.ts";

type Point = [number, number];

const square: Point[] = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
];

// L-shape: 4x4 square minus the 2x2 notch at the top right (x 2..4, z 2..4). Area 12.
const lShape: Point[] = [
  [0, 0],
  [4, 0],
  [4, 2],
  [2, 2],
  [2, 4],
  [0, 4],
];

const rad = (deg: number) => (deg * Math.PI) / 180;

function buildObb(overrides: Partial<Obb> = {}): Obb {
  return { cx: 0, cz: 0, hx: 1, hz: 1, angle: 0, ...overrides };
}

describe("polygonArea", () => {
  // Red if the shoelace sum is wrong or the sign is not made absolute.
  it("returns the area of a rectangle", () => {
    expect(polygonArea(square)).toBeCloseTo(12, 9);
  });

  it("returns the same positive area for clockwise and counter-clockwise order", () => {
    expect(polygonArea([...square].reverse())).toBeCloseTo(12, 9);
    expect(polygonArea(square)).toBeGreaterThan(0);
  });

  // Red if the implementation uses the bounding box instead of the shoelace formula.
  it("returns the area of a concave L-shape", () => {
    expect(polygonArea(lShape)).toBeCloseTo(12, 9);
    expect(polygonArea([...lShape].reverse())).toBeCloseTo(12, 9);
  });
});

describe("polygonCentroid", () => {
  it("returns the centre of a rectangle", () => {
    const [x, z] = polygonCentroid(square);
    expect(x).toBeCloseTo(2, 9);
    expect(z).toBeCloseTo(1.5, 9);
  });

  // Red if the vertex average is used instead of the area centroid (that would give 2, 2).
  it("returns the area centroid of an L-shape, independent of winding", () => {
    for (const points of [lShape, [...lShape].reverse()]) {
      const [x, z] = polygonCentroid(points);
      expect(x).toBeCloseTo(20 / 12, 9);
      expect(z).toBeCloseTo(20 / 12, 9);
    }
  });
});

describe("pointInPolygon", () => {
  it("detects points inside and outside a rectangle", () => {
    expect(pointInPolygon([2, 1.5], square)).toBe(true);
    expect(pointInPolygon([5, 1.5], square)).toBe(false);
    expect(pointInPolygon([2, -0.5], square)).toBe(false);
  });

  // Red if the implementation tests against the bounding box: (3, 3) lies in the notch.
  it("handles a concave polygon", () => {
    expect(pointInPolygon([1, 3], lShape)).toBe(true);
    expect(pointInPolygon([3, 1], lShape)).toBe(true);
    expect(pointInPolygon([3, 3], lShape)).toBe(false);
    expect(pointInPolygon([-1, 1], lShape)).toBe(false);
    expect(pointInPolygon([5, 1], lShape)).toBe(false);
  });
});

describe("wallLength", () => {
  it("returns the euclidean length from start to end", () => {
    const wall = { id: "wall_a", startX: 0, startZ: 0, endX: 3, endZ: 4, thickness: 0.2, exterior: false };
    expect(wallLength(wall)).toBeCloseTo(5, 9);
  });
});

describe("openingSegment", () => {
  const baseOpening = {
    id: "opening_a",
    wallId: "wall_a",
    type: "door" as const,
    offsetFromStart: 1,
    width: 1.5,
    height: 2.1,
    sillHeight: 0,
  };

  it("measures the offset from the wall start along an axis-aligned wall", () => {
    const wall = { id: "wall_a", startX: 0, startZ: 0, endX: 0, endZ: 4, thickness: 0.2, exterior: false };
    const segment = openingSegment(wall, baseOpening);
    expect(segment.start[0]).toBeCloseTo(0, 9);
    expect(segment.start[1]).toBeCloseTo(1, 9);
    expect(segment.end[0]).toBeCloseTo(0, 9);
    expect(segment.end[1]).toBeCloseTo(2.5, 9);
  });

  // Red if the direction is not normalised by the wall length (3-4-5 wall).
  it("follows the wall direction on a diagonal wall", () => {
    const wall = { id: "wall_a", startX: 0, startZ: 0, endX: 3, endZ: 4, thickness: 0.2, exterior: false };
    const segment = openingSegment(wall, { ...baseOpening, offsetFromStart: 1, width: 2 });
    expect(segment.start[0]).toBeCloseTo(0.6, 9);
    expect(segment.start[1]).toBeCloseTo(0.8, 9);
    expect(segment.end[0]).toBeCloseTo(1.8, 9);
    expect(segment.end[1]).toBeCloseTo(2.4, 9);
  });
});

describe("roomForPoint", () => {
  it("returns the id of the room containing the point", () => {
    const apartment = buildValidApartment();
    expect(roomForPoint(apartment as never, 1, 1)).toBe("room_living");
    expect(roomForPoint(apartment as never, 5, 1)).toBe("room_bedroom");
  });

  it("returns null when no room contains the point", () => {
    expect(roomForPoint(buildValidApartment() as never, 10, 10)).toBeNull();
  });

  it("returns the first room in list order when rooms overlap", () => {
    const apartment = buildValidApartment();
    apartment.rooms = [
      { id: "room_second", name: "B", polygon: [[0, 0], [5, 0], [5, 5], [0, 5]] },
      { id: "room_first", name: "A", polygon: [[0, 0], [5, 0], [5, 5], [0, 5]] },
    ] as never;
    expect(roomForPoint(apartment as never, 2, 2)).toBe("room_second");
  });
});

describe("itemObb", () => {
  const footprint = { halfWidth: 0.5, halfDepth: 1, centerX: 0, centerZ: 0, minY: 0, maxY: 1 };
  const item = (x: number, z: number, rotation: number) =>
    ({ id: "item_a", assetId: "asset_a", x, z, rotation, params: {}, locked: false, hidden: false, lightOn: false }) as never;

  it("maps half sizes to hx/hz and keeps the origin for an unrotated item", () => {
    const obb = itemObb(item(2, 3, 0), footprint);
    expect(obb.cx).toBeCloseTo(2, 9);
    expect(obb.cz).toBeCloseTo(3, 9);
    expect(obb.hx).toBeCloseTo(0.5, 9);
    expect(obb.hz).toBeCloseTo(1, 9);
    expect(Math.cos(obb.angle)).toBeCloseTo(1, 9);
    expect(Math.sin(obb.angle)).toBeCloseTo(0, 9);
  });

  // Red if rotation is not converted to radians or its sign is flipped.
  it("stores the item rotation in radians with the three.js convention", () => {
    for (const degrees of [90, 30, 270]) {
      const obb = itemObb(item(0, 0, degrees), footprint);
      expect(Math.cos(obb.angle)).toBeCloseTo(Math.cos(rad(degrees)), 9);
      expect(Math.sin(obb.angle)).toBeCloseTo(Math.sin(rad(degrees)), 9);
    }
  });

  // Red if the footprint offset is not rotated with the item: local (1, 0) at rotation 90 is world (0, -1).
  it("rotates a footprint centre offset along x (rotation 90)", () => {
    const obb = itemObb(item(2, 3, 90), { ...footprint, centerX: 1, centerZ: 0 });
    expect(obb.cx).toBeCloseTo(2, 9);
    expect(obb.cz).toBeCloseTo(2, 9);
  });

  // Local (0, 1) at rotation 90 is world (+1, 0).
  it("rotates a footprint centre offset along z (rotation 90)", () => {
    const obb = itemObb(item(2, 3, 90), { ...footprint, centerX: 0, centerZ: 1 });
    expect(obb.cx).toBeCloseTo(3, 9);
    expect(obb.cz).toBeCloseTo(3, 9);
  });

  // Spec formula: world = (x + px cos + pz sin, z - px sin + pz cos), px = 1, pz = 2, 30 degrees.
  it("applies the spec rotation formula for an arbitrary angle", () => {
    const theta = rad(30);
    const obb = itemObb(item(2, 3, 30), { ...footprint, centerX: 1, centerZ: 2 });
    expect(obb.cx).toBeCloseTo(2 + Math.cos(theta) + 2 * Math.sin(theta), 9);
    expect(obb.cz).toBeCloseTo(3 - Math.sin(theta) + 2 * Math.cos(theta), 9);
  });
});

describe("wallObb", () => {
  // The obb's local x axis is (cos a, -sin a); it must be parallel to the wall direction.
  const crossWithWall = (obb: Obb, dx: number, dz: number) => Math.cos(obb.angle) * dz + Math.sin(obb.angle) * dx;

  it("centres on the wall midpoint with half length and half thickness", () => {
    const wall = { id: "wall_a", startX: 1, startZ: 2, endX: 7, endZ: 2, thickness: 0.3, exterior: false };
    const obb = wallObb(wall);
    expect(obb.cx).toBeCloseTo(4, 9);
    expect(obb.cz).toBeCloseTo(2, 9);
    expect(obb.hx).toBeCloseTo(3, 9);
    expect(obb.hz).toBeCloseTo(0.15, 9);
    expect(crossWithWall(obb, 6, 0)).toBeCloseTo(0, 9);
  });

  // Red if the angle is taken as atan2(dz, dx) without the sign flip of the three.js convention.
  it("aligns the long axis with a diagonal wall", () => {
    const wall = { id: "wall_a", startX: 0, startZ: 0, endX: 3, endZ: 4, thickness: 0.2, exterior: false };
    const obb = wallObb(wall);
    expect(obb.hx).toBeCloseTo(2.5, 9);
    expect(obb.hz).toBeCloseTo(0.1, 9);
    expect(crossWithWall(obb, 3, 4)).toBeCloseTo(0, 9);
  });
});

describe("obbIntersects", () => {
  it("detects overlapping and separated axis-aligned boxes", () => {
    expect(obbIntersects(buildObb(), buildObb({ cx: 1.5 }))).toBe(true);
    expect(obbIntersects(buildObb(), buildObb({ cx: 2.5 }))).toBe(false);
    expect(obbIntersects(buildObb(), buildObb({ cz: 2.5 }))).toBe(false);
  });

  // Red if the implementation only compares axis-aligned extents: the diamond's tip reaches 1.414
  // but the nearest corner of b (0.9, 0.9) lies outside |x| + |z| <= 1.414.
  it("uses the rotated axes (diamond vs box)", () => {
    const diamond = buildObb({ angle: Math.PI / 4 });
    expect(obbIntersects(diamond, buildObb({ cx: 1.2, cz: 1.2, hx: 0.3, hz: 0.3 }))).toBe(false);
    expect(obbIntersects(diamond, buildObb({ cx: 0.9, cz: 0.9, hx: 0.3, hz: 0.3 }))).toBe(true);
  });

  // Red if angle is ignored or its sign flipped: at angle pi/2 the local x axis runs along world z.
  it("applies the item rotation convention to the angle", () => {
    const plank = buildObb({ hx: 2, hz: 0.1, angle: Math.PI / 2 });
    expect(obbIntersects(plank, buildObb({ cz: 1.5, hx: 0.3, hz: 0.3 }))).toBe(true);
    expect(obbIntersects(plank, buildObb({ cx: 1.5, hx: 0.3, hz: 0.3 }))).toBe(false);
  });

  it("is symmetric", () => {
    const a = buildObb({ angle: 0.4 });
    const b = buildObb({ cx: 1.6, cz: 0.5, hx: 0.5, hz: 0.7, angle: -0.3 });
    expect(obbIntersects(a, b)).toBe(obbIntersects(b, a));
  });

  // Red if touching counts as an intersection or the tolerance is not applied.
  it("treats touching within the default tolerance as no intersection", () => {
    expect(obbIntersects(buildObb(), buildObb({ cx: 2 }))).toBe(false);
    expect(obbIntersects(buildObb(), buildObb({ cx: 1.9995 }))).toBe(false);
    expect(obbIntersects(buildObb(), buildObb({ cx: 1.99 }))).toBe(true);
  });

  it("honours a custom tolerance", () => {
    expect(obbIntersects(buildObb(), buildObb({ cx: 1.99 }), 0.02)).toBe(false);
    expect(obbIntersects(buildObb(), buildObb({ cx: 1.9 }), 0.02)).toBe(true);
  });
});

describe("obbDistance", () => {
  it("returns the gap between axis-aligned boxes", () => {
    expect(obbDistance(buildObb(), buildObb({ cx: 3 }))).toBeCloseTo(1, 9);
  });

  // Red if only the axis gap is used instead of the euclidean corner distance.
  it("returns the corner-to-corner distance for diagonal boxes", () => {
    expect(obbDistance(buildObb(), buildObb({ cx: 3, cz: 3 }))).toBeCloseTo(Math.SQRT2, 9);
  });

  it("returns 0 for intersecting boxes", () => {
    expect(obbDistance(buildObb(), buildObb({ cx: 1 }))).toBe(0);
  });

  it("measures from a rotated box tip", () => {
    const diamond = buildObb({ angle: Math.PI / 4 });
    const box = buildObb({ cx: 2.5, hx: 0.5, hz: 0.5 });
    const expected = 2 - Math.SQRT2;
    expect(obbDistance(diamond, box)).toBeCloseTo(expected, 6);
    expect(obbDistance(box, diamond)).toBeCloseTo(expected, 6);
  });
});
