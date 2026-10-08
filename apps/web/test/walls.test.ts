import { type Opening, type Wall } from "@app/core";
import { SEED_DOCUMENT } from "../../../packages/core/src/seed/index.ts";
import { describe, expect, it } from "vitest";
import type { Vector3 } from "three";
import { buildWallGeometry } from "../src/scene/build/walls.ts";
import { boundsOf, getTriangles, getVertices, hasOnlyFiniteValues, sumArea, type Triangle } from "./helpers/geometry.ts";

const { walls, openings, meta } = SEED_DOCUMENT.apartment;
const CEILING = meta.ceilingHeight;
const EPS = 1e-6;

const wallById = (id: string): Wall => walls.find((wall) => wall.id === id)!;
const openingById = (id: string): Opening => openings.find((opening) => opening.id === id)!;
const wallLength = (wall: Wall) => Math.hypot(wall.endX - wall.startX, wall.endZ - wall.startZ);

/** Wall-local frame: u along the centre line from the start, v up, w across the thickness (centred). */
function localFrame(wall: Wall) {
  const length = wallLength(wall);
  const dirX = (wall.endX - wall.startX) / length;
  const dirZ = (wall.endZ - wall.startZ) / length;
  return {
    length,
    toLocal: (p: Vector3) => ({
      u: (p.x - wall.startX) * dirX + (p.z - wall.startZ) * dirZ,
      v: p.y,
      w: -(p.x - wall.startX) * dirZ + (p.z - wall.startZ) * dirX,
    }),
    dirToLocal: (n: Vector3) => ({ u: n.x * dirX + n.z * dirZ, v: n.y, w: -n.x * dirZ + n.z * dirX }),
  };
}

function holeRect(opening: Opening, ceiling = CEILING) {
  return {
    u0: opening.offsetFromStart,
    u1: opening.offsetFromStart + opening.width,
    v0: opening.sillHeight,
    v1: Math.min(opening.sillHeight + opening.height, ceiling),
  };
}

const holeArea = (opening: Opening, ceiling = CEILING) => {
  const rect = holeRect(opening, ceiling);
  return (rect.u1 - rect.u0) * (rect.v1 - rect.v0);
};

/** Triangles lying fully in one face plane of the wall (w = +-thickness/2) and facing along w. */
function sideFaces(triangles: Triangle[], wall: Wall, side: 1 | -1) {
  const { toLocal, dirToLocal } = localFrame(wall);
  return triangles.filter((t) =>
    t.positions.every((p) => Math.abs(toLocal(p).w - (side * wall.thickness) / 2) < EPS)
    && Math.abs(dirToLocal(t.faceNormal).w) > 0.99);
}

describe("buildWallGeometry", () => {
  // Single-wall tests below pass [wall] as the wall list: nothing joins, so no end is extended.
  describe("plain wall without openings", () => {
    const wall = wallById("wall_kitchen_bath");
    const geometry = buildWallGeometry(wall, [wall], openings, CEILING);

    // Red if length, thickness, height or placement of the box is wrong.
    it("is a box along the centre line, thickness deep and 0..ceilingHeight high", () => {
      const { min, max } = boundsOf(geometry);
      expect(min.x).toBeCloseTo(wall.startX, 5);
      expect(max.x).toBeCloseTo(wall.endX, 5);
      expect(min.z).toBeCloseTo(wall.startZ - wall.thickness / 2, 5);
      expect(max.z).toBeCloseTo(wall.startZ + wall.thickness / 2, 5);
      expect(min.y).toBeCloseTo(0, 5);
      expect(max.y).toBeCloseTo(CEILING, 5);
    });

    // Red if a diagonal wall is built along the axes instead of its own direction.
    it("follows a diagonal centre line", () => {
      const diagonal: Wall = { id: "wall_diag", startX: 1, startZ: 1, endX: 4, endZ: 5, thickness: 0.2, exterior: false };
      const { toLocal } = localFrame(diagonal);
      for (const vertex of getVertices(buildWallGeometry(diagonal, [diagonal], [], 2.5))) {
        const local = toLocal(vertex);
        expect(local.u).toBeGreaterThan(-EPS);
        expect(local.u).toBeLessThan(5 + EPS);
        expect(Math.abs(local.w)).toBeLessThan(0.1 + EPS);
        expect(local.v).toBeGreaterThan(-EPS);
        expect(local.v).toBeLessThan(2.5 + EPS);
      }
    });

    // Red if the surface area is not that of a closed box (a missing face).
    it("has the surface area of a closed box", () => {
      const L = wallLength(wall);
      const t = wall.thickness;
      expect(sumArea(getTriangles(geometry))).toBeCloseTo(2 * (L * CEILING + L * t + t * CEILING), 4);
    });

    // Red if the geometry carries groups or no index.
    it("has a single index and no groups", () => {
      expect(geometry.getIndex()).not.toBeNull();
      expect(geometry.groups).toHaveLength(0);
    });

    // Red if openings of other walls are cut into this one.
    it("ignores openings that belong to other walls", () => {
      const L = wallLength(wall);
      const front = sideFaces(getTriangles(geometry), wall, 1);
      expect(sumArea(front)).toBeCloseTo(L * CEILING, 4);
    });
  });

  describe("wall with two openings (wall_north: front door + kitchen window)", () => {
    const wall = wallById("wall_north");
    const door = openingById("opening_front_door");
    const window = openingById("opening_kitchen_window_north");
    const geometry = buildWallGeometry(wall, [wall], openings, CEILING);
    const triangles = getTriangles(geometry);
    const frame = localFrame(wall);

    // Red if the geometry cannot be built for a wall with holes or contains NaN.
    it("produces finite, non-empty geometry", () => {
      expect(triangles.length).toBeGreaterThan(12);
      expect(hasOnlyFiniteValues(geometry)).toBe(true);
    });

    // Red if the outer box changes because of the holes.
    it("keeps the outer bounds of the wall", () => {
      const { min, max } = boundsOf(geometry);
      expect(min.x).toBeCloseTo(wall.startX, 5);
      expect(max.x).toBeCloseTo(wall.endX, 5);
      expect(max.y).toBeCloseTo(CEILING, 5);
    });

    // Red if a hole is missing, misplaced or has the wrong size: each face loses exactly the hole areas.
    it("removes exactly both hole areas from the front and the back face", () => {
      const expected = frame.length * CEILING - holeArea(door) - holeArea(window);
      expect(sumArea(sideFaces(triangles, wall, 1))).toBeCloseTo(expected, 4);
      expect(sumArea(sideFaces(triangles, wall, -1))).toBeCloseTo(expected, 4);
    });

    // Red if any triangle covers the opening: no face centroid lies strictly inside a hole rectangle.
    it("leaves both holes open through the full thickness", () => {
      for (const opening of [door, window]) {
        const rect = holeRect(opening);
        const covering = triangles.filter((t) => {
          const c = frame.toLocal(t.centroid);
          return c.u > rect.u0 + EPS && c.u < rect.u1 - EPS && c.v > rect.v0 + EPS && c.v < rect.v1 - EPS;
        });
        expect(covering, opening.id).toHaveLength(0);
      }
    });

    // Red if the hole edges are not part of the mesh (vertices at every hole corner on both faces).
    it("has vertices at every hole corner on both wall faces", () => {
      const vertices = getVertices(geometry).map((v) => frame.toLocal(v));
      for (const opening of [door, window]) {
        const rect = holeRect(opening);
        for (const u of [rect.u0, rect.u1]) {
          for (const v of [rect.v0, rect.v1]) {
            for (const w of [-wall.thickness / 2, wall.thickness / 2]) {
              const found = vertices.some((p) => Math.abs(p.u - u) < 1e-5 && Math.abs(p.v - v) < 1e-5 && Math.abs(p.w - w) < 1e-5);
              expect(found, `${opening.id} corner u=${u} v=${v} w=${w}`).toBe(true);
            }
          }
        }
      }
    });

    // Red if the window hole is placed with the sill/offset swapped or the door is cut from the wrong side.
    it("places the window hole at its offset and sill", () => {
      const rect = holeRect(window);
      const vertices = getVertices(geometry).map((v) => frame.toLocal(v));
      expect(vertices.some((p) => Math.abs(p.u - rect.u0) < 1e-5 && Math.abs(p.v - window.sillHeight) < 1e-5)).toBe(true);
      expect(vertices.some((p) => Math.abs(p.u - rect.u1) < 1e-5 && Math.abs(p.v - (window.sillHeight + window.height)) < 1e-5)).toBe(true);
    });
  });

  describe("hole reveals", () => {
    // Red if the inner faces of the hole are missing (the hole would show the wall's inside as empty).
    it("adds reveal faces of thickness depth around a window hole", () => {
      const wall = wallById("wall_east");
      const window = openingById("opening_kitchen_window_east");
      const frame = localFrame(wall);
      const rect = holeRect(window);
      const triangles = getTriangles(buildWallGeometry(wall, [wall], openings, CEILING));
      const reveals = triangles.filter((t) => {
        const c = frame.toLocal(t.centroid);
        const n = frame.dirToLocal(t.faceNormal);
        return Math.abs(n.w) < 0.01
          && c.u > rect.u0 - EPS && c.u < rect.u1 + EPS && c.v > rect.v0 - EPS && c.v < rect.v1 + EPS;
      });
      const expectedArea = wall.thickness * 2 * (window.width + window.height);
      expect(sumArea(reveals)).toBeCloseTo(expectedArea, 4);
    });

    // Red if reveal normals point into the wall instead of into the hole.
    it("orients reveal normals towards the inside of the hole", () => {
      const wall = wallById("wall_east");
      const window = openingById("opening_kitchen_window_east");
      const frame = localFrame(wall);
      const rect = holeRect(window);
      const centre = { u: (rect.u0 + rect.u1) / 2, v: (rect.v0 + rect.v1) / 2 };
      const reveals = getTriangles(buildWallGeometry(wall, [wall], openings, CEILING)).filter((t) => {
        const c = frame.toLocal(t.centroid);
        const n = frame.dirToLocal(t.faceNormal);
        return Math.abs(n.w) < 0.01 && c.u > rect.u0 - EPS && c.u < rect.u1 + EPS && c.v > rect.v0 - EPS && c.v < rect.v1 + EPS;
      });
      expect(reveals.length).toBeGreaterThan(0);
      for (const t of reveals) {
        const c = frame.toLocal(t.centroid);
        const n = frame.dirToLocal(t.faceNormal);
        expect((centre.u - c.u) * n.u + (centre.v - c.v) * n.v).toBeGreaterThan(0);
      }
    });
  });

  describe("openings reaching the floor or the ceiling", () => {
    // Red if a door hole is cut as a closed rectangle (leaving a sill) or not cut at all.
    it("opens a door from sill height 0", () => {
      const wall = wallById("wall_hallway_west");
      const frame = localFrame(wall);
      const wallOpenings = openings.filter((opening) => opening.wallId === wall.id);
      const triangles = getTriangles(buildWallGeometry(wall, [wall], openings, CEILING));
      const expected = frame.length * CEILING - wallOpenings.reduce((sum, opening) => sum + holeArea(opening), 0);
      expect(sumArea(sideFaces(triangles, wall, 1))).toBeCloseTo(expected, 4);
      expect(wallOpenings).toHaveLength(2);
    });

    // Red if the hole is not clamped to the ceiling (hole area would be bigger than the wall allows).
    it("clamps a hole that would exceed the ceiling", () => {
      const wall = wallById("wall_north");
      const door = openingById("opening_front_door");
      const lowCeiling = 2;
      const triangles = getTriangles(buildWallGeometry(wall, [wall], [door], lowCeiling));
      const expected = wallLength(wall) * lowCeiling - holeArea(door, lowCeiling);
      expect(sumArea(sideFaces(triangles, wall, 1))).toBeCloseTo(expected, 4);
      expect(boundsOf(buildWallGeometry(wall, [wall], [door], lowCeiling)).max.y).toBeCloseTo(lowCeiling, 5);
    });
  });

  describe("UVs and normals", () => {
    const wall = wallById("wall_north");
    const triangles = getTriangles(buildWallGeometry(wall, [wall], openings, CEILING));

    // Red if UVs are normalised 0..1 instead of metres: every edge must have the same length in UV and in space.
    it("maps UVs in metres on every face", () => {
      for (const t of triangles) {
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
          expect(t.uvs[a].distanceTo(t.uvs[b])).toBeCloseTo(t.positions[a].distanceTo(t.positions[b]), 4);
        }
      }
    });

    // Red if the UV scale depends on the wall length (a 0..1 stretch).
    it("keeps the UV scale independent of wall size", () => {
      const short: Wall = { ...wall, id: "wall_short", endX: wall.startX + 1 };
      const shortTriangles = getTriangles(buildWallGeometry(short, [short], [], CEILING));
      const front = sideFaces(shortTriangles, short, 1);
      const us = front.flatMap((t) => t.uvs.map((uv) => uv.x));
      const vs = front.flatMap((t) => t.uvs.map((uv) => uv.y));
      const span = (values: number[]) => Math.max(...values) - Math.min(...values);
      const uSpan = span(us);
      const vSpan = span(vs);
      // One of the axes is the wall length (1 m), the other the height.
      expect([uSpan, vSpan].sort((a, b) => a - b)).toEqual([expect.closeTo(1, 4), expect.closeTo(CEILING, 4)]);
    });

    // Red if vertex normals disagree with the winding order (inside-out or smoothed faces).
    it("has vertex normals equal to the face normal of each triangle", () => {
      for (const t of triangles) {
        for (const normal of t.normals) expect(normal.dot(t.faceNormal)).toBeGreaterThan(0.99);
      }
    });

    // Red if the large faces point into the wall: the front/back normals must point away from the centre line.
    it("points the front and back face normals outwards", () => {
      const frame = localFrame(wall);
      for (const t of triangles) {
        const c = frame.toLocal(t.centroid);
        const n = frame.dirToLocal(t.faceNormal);
        if (Math.abs(Math.abs(c.w) - wall.thickness / 2) < EPS && Math.abs(n.w) > 0.99) {
          expect(Math.sign(n.w)).toBe(Math.sign(c.w));
        }
      }
    });

    // Red if the wall top or end caps point inwards.
    it("points the top face of the wall upwards", () => {
      const tops = triangles.filter((t) => Math.abs(t.centroid.y - CEILING) < EPS && Math.abs(t.faceNormal.y) > 0.99);
      expect(tops.length).toBeGreaterThan(0);
      for (const t of tops) expect(t.faceNormal.y).toBeGreaterThan(0.99);
    });
  });

  describe("corner joins (full seed wall list)", () => {
    const wallsById = (id: string) => boundsOf(buildWallGeometry(wallById(id), walls, openings, CEILING));
    const inside = (box: ReturnType<typeof boundsOf>, x: number, y: number, z: number) =>
      x >= box.min.x - EPS && x <= box.max.x + EPS && y >= box.min.y - EPS && y <= box.max.y + EPS && z >= box.min.z - EPS && z <= box.max.z + EPS;

    // Red if outer walls are not extended by half their own thickness (0.18 m) at both ends.
    it("extends the outer walls at joined ends by half their thickness", () => {
      const north = wallsById("wall_north");
      expect(north.min.x).toBeCloseTo(0, 5);
      expect(north.max.x).toBeCloseTo(9.36, 5);
      expect(north.min.z).toBeCloseTo(0, 5);
      expect(north.max.z).toBeCloseTo(0.36, 5);
      const west = wallsById("wall_west");
      expect(west.min.z).toBeCloseTo(0, 5);
      expect(west.max.z).toBeCloseTo(7.36, 5);
      expect(west.min.x).toBeCloseTo(0, 5);
      expect(west.max.x).toBeCloseTo(0.36, 5);
    });

    // Red if an L-corner keeps a notch: the corner square centre must be covered by both adjoining walls.
    it("covers the square of every outer L-corner", () => {
      const corners: Array<[string, string, number, number]> = [
        ["wall_north", "wall_west", 0.09, 0.09],
        ["wall_north", "wall_east", 9.27, 0.09],
        ["wall_south", "wall_west", 0.09, 7.27],
        ["wall_south", "wall_east", 9.27, 7.27],
      ];
      for (const [a, b, x, z] of corners) {
        expect(inside(wallsById(a), x, 1, z), `${a} @ ${x},${z}`).toBe(true);
        expect(inside(wallsById(b), x, 1, z), `${b} @ ${x},${z}`).toBe(true);
      }
    });

    // Red if interior walls are not extended by their own half thickness (0.055) or are extended further (poking out).
    it("extends interior walls ending on an outer wall's centre line by their own half thickness", () => {
      const hallway = wallsById("wall_hallway_west");
      expect(hallway.min.z).toBeCloseTo(0.18 - 0.055, 5);
      expect(hallway.max.z).toBeCloseTo(7.18 + 0.055, 5);
      expect(hallway.min.x).toBeCloseTo(5.1 - 0.055, 5);
      expect(hallway.max.x).toBeCloseTo(5.1 + 0.055, 5);
      // Stays inside the outer walls (their outer faces are at z = 0 and z = 7.36).
      expect(hallway.min.z).toBeGreaterThan(0);
      expect(hallway.max.z).toBeLessThan(7.36);
    });

    // Red if an interior wall joining a perpendicular interior wall's centre line is not extended on that end.
    it("extends interior walls at both joins (outer wall and interior wall)", () => {
      const bedroomLiving = wallsById("wall_bedroom_living");
      expect(bedroomLiving.min.x).toBeCloseTo(0.18 - 0.055, 5);
      expect(bedroomLiving.max.x).toBeCloseTo(5.1 + 0.055, 5);
      expect(bedroomLiving.min.x).toBeGreaterThan(0);
    });

    // Red if the extension changes the thickness or height of the wall.
    it("keeps thickness and height when extending", () => {
      const north = wallsById("wall_north");
      expect(north.size.z).toBeCloseTo(0.36, 5);
      expect(north.max.y).toBeCloseTo(CEILING, 5);
      expect(north.min.y).toBeCloseTo(0, 5);
    });
  });

  describe("free ends and near misses (tiny apartment)", () => {
    const thick = 0.2;
    const a: Wall = { id: "wall_a", startX: 0, startZ: 0, endX: 4, endZ: 0, thickness: thick, exterior: true };
    const b: Wall = { id: "wall_b", startX: 4, startZ: 0, endX: 4, endZ: 3, thickness: thick, exterior: true };
    const list = [a, b];

    // Red if a free end is extended, or a joined end is not.
    it("extends only the joined end", () => {
      const boxA = boundsOf(buildWallGeometry(a, list, [], 2.5));
      expect(boxA.min.x).toBeCloseTo(0, 5);
      expect(boxA.max.x).toBeCloseTo(4.1, 5);
      const boxB = boundsOf(buildWallGeometry(b, list, [], 2.5));
      expect(boxB.min.z).toBeCloseTo(-0.1, 5);
      expect(boxB.max.z).toBeCloseTo(3, 5);
    });

    // Red if the join test is not tight (5 mm away from the centre line is no join).
    it("does not extend an end that is 5 mm away from another wall", () => {
      const c: Wall = { id: "wall_c", startX: 2, startZ: 2, endX: 2, endZ: 0.005, thickness: 0.1, exterior: false };
      const box = boundsOf(buildWallGeometry(c, [a, c], [], 2.5));
      expect(box.min.z).toBeCloseTo(0.005, 5);
    });

    // Red if a joined end within 1 mm of the centre line is not recognised.
    it("extends an end that lies within 1 mm of another wall's centre line", () => {
      const c: Wall = { id: "wall_c", startX: 2, startZ: 2, endX: 2, endZ: 0.0005, thickness: 0.1, exterior: false };
      const box = boundsOf(buildWallGeometry(c, [a, c], [], 2.5));
      expect(box.min.z).toBeCloseTo(0.0005 - 0.05, 5);
    });

    // Red if the wall joins itself (a wall's own end points must not count as another wall).
    it("ignores the wall itself when looking for joins", () => {
      const box = boundsOf(buildWallGeometry(a, [a], [], 2.5));
      expect(box.min.x).toBeCloseTo(0, 5);
      expect(box.max.x).toBeCloseTo(4, 5);
    });
  });

  describe("L-joints between walls of unequal thickness (spec editor section 7)", () => {
    const HEIGHT = 2.5;
    const makeWall = (id: string, startX: number, startZ: number, endX: number, endZ: number, thickness: number): Wall =>
      ({ id, startX, startZ, endX, endZ, thickness, exterior: false });
    // Thick wall a runs east and meets thin wall b at (4, 0), b runs south from there.
    const thick = makeWall("wall_thick", 0, 0, 4, 0, 0.3);
    const thin = makeWall("wall_thin", 4, 0, 4, 3, 0.1);
    const list = [thick, thin];

    // Red if the extension still uses the wall's own thickness (a would end at 4.15) instead of the other wall's half (0.05).
    it("extends the thick wall by half of the thin wall's thickness", () => {
      const box = boundsOf(buildWallGeometry(thick, list, [], HEIGHT));
      expect(box.min.x).toBeCloseTo(0, 5);
      expect(box.max.x).toBeCloseTo(4.05, 5);
    });

    // Red if the thin wall is extended by its own half thickness (0.05) instead of the thick wall's half (0.15): the corner would stay open.
    it("extends the thin wall by half of the thick wall's thickness", () => {
      const box = boundsOf(buildWallGeometry(thin, list, [], HEIGHT));
      expect(box.min.z).toBeCloseTo(-0.15, 5);
      expect(box.max.z).toBeCloseTo(3, 5);
    });

    // Red if the rule depends on the drawing direction of the walls (end vs start): same corner, thin wall drawn towards the corner.
    it("applies the same rule to a start point meeting an end point", () => {
      const reversedThin = makeWall("wall_thin", 4, 3, 4, 0, 0.1);
      const box = boundsOf(buildWallGeometry(reversedThin, [thick, reversedThin], [], HEIGHT));
      expect(box.min.z).toBeCloseTo(-0.15, 5);
      expect(box.max.z).toBeCloseTo(3, 5);
      const reversedThick = makeWall("wall_thick", 4, 0, 0, 0, 0.3);
      const thickBox = boundsOf(buildWallGeometry(reversedThick, [reversedThick, thin], [], HEIGHT));
      expect(thickBox.max.x).toBeCloseTo(4.05, 5);
      expect(thickBox.min.x).toBeCloseTo(0, 5);
    });

    // Red if the thin wall's corner square is not covered: both walls together must cover the square around (4, 0).
    it("closes the corner: the thick wall's side faces reach the thin wall's outer face", () => {
      const thickBox = boundsOf(buildWallGeometry(thick, list, [], HEIGHT));
      const thinBox = boundsOf(buildWallGeometry(thin, list, [], HEIGHT));
      // thin wall outer face at x = 4.05, thick wall outer face at z = -0.15
      expect(thickBox.max.x).toBeGreaterThanOrEqual(thinBox.max.x - EPS);
      expect(thinBox.min.z).toBeLessThanOrEqual(thickBox.min.z + EPS);
    });
  });

  describe("T-joints (spec editor section 7)", () => {
    const HEIGHT = 2.5;
    const through: Wall = { id: "wall_through", startX: 0, startZ: 0, endX: 6, endZ: 0, thickness: 0.3, exterior: true };
    const makeStub = (id: string, thickness: number): Wall => ({ id, startX: 3, startZ: 3, endX: 3, endZ: 0, thickness, exterior: false });

    // Red if a thin wall meeting a thick wall's centre line is extended by the thick wall's half (0.15) instead of its own half (0.05).
    it("extends by min(own, other) / 2 when the joining wall is thinner", () => {
      const stub = makeStub("wall_stub", 0.1);
      const box = boundsOf(buildWallGeometry(stub, [through, stub], [], HEIGHT));
      expect(box.min.z).toBeCloseTo(-0.05, 5);
      expect(box.max.z).toBeCloseTo(3, 5);
    });

    // Red if a thick wall meeting a thin wall's centre line is extended by its own half (0.25): it would poke through the thin wall.
    it("extends by min(own, other) / 2 when the joining wall is thicker", () => {
      const thinThrough: Wall = { ...through, id: "wall_thin_through", thickness: 0.3 };
      const stub = makeStub("wall_fat_stub", 0.5);
      const box = boundsOf(buildWallGeometry(stub, [thinThrough, stub], [], HEIGHT));
      expect(box.min.z).toBeCloseTo(-0.15, 5);
    });

    // Red if the through-going wall is changed by a wall ending on its centre line.
    it("does not extend or alter the wall that is joined in the middle", () => {
      const stub = makeStub("wall_stub", 0.1);
      const box = boundsOf(buildWallGeometry(through, [through, stub], [], HEIGHT));
      expect(box.min.x).toBeCloseTo(0, 5);
      expect(box.max.x).toBeCloseTo(6, 5);
      expect(box.min.z).toBeCloseTo(-0.15, 5);
      expect(box.max.z).toBeCloseTo(0.15, 5);
    });
  });

  describe("end caps and top faces at joined ends (spec editor section 7)", () => {
    const HEIGHT = 2.5;
    const thick: Wall = { id: "wall_thick", startX: 0, startZ: 0, endX: 4, endZ: 0, thickness: 0.3, exterior: false };
    const thin: Wall = { id: "wall_thin", startX: 4, startZ: 0, endX: 4, endZ: 3, thickness: 0.1, exterior: false };
    const frame = localFrame(thick);
    const triangles = getTriangles(buildWallGeometry(thick, [thick, thin], [], HEIGHT));

    const capsAt = (u: number) => triangles.filter((t) => t.positions.every((p) => Math.abs(frame.toLocal(p).u - u) < EPS) && Math.abs(frame.dirToLocal(t.faceNormal).u) > 0.99);
    const tops = triangles.filter((t) => t.positions.every((p) => Math.abs(p.y - HEIGHT) < EPS) && t.faceNormal.y > 0.99);

    // Red if a cap is generated at the joined end (it would be coplanar with the joined wall's face and z-fight).
    it("has no end cap at the joined end", () => {
      const caps = triangles.filter((t) => Math.abs(frame.dirToLocal(t.faceNormal).u) > 0.99 && frame.toLocal(t.centroid).u > 1);
      expect(caps).toHaveLength(0);
    });

    // Red if the free end loses its cap (the wall would be open).
    it("keeps the end cap at the free end", () => {
      expect(sumArea(capsAt(0))).toBeCloseTo(0.3 * HEIGHT, 4);
    });

    // Red if the top face continues over the extension at the joined end.
    it("has no top face over the extension at the joined end", () => {
      expect(tops.length).toBeGreaterThan(0);
      for (const t of tops) for (const p of t.positions) expect(frame.toLocal(p).u).toBeLessThanOrEqual(4 + EPS);
    });

    // Red if the top face is dropped over the main length of the wall or at the free end.
    it("keeps the top face over the centre-line length", () => {
      expect(sumArea(tops)).toBeCloseTo(4 * 0.3, 4);
      expect(Math.min(...tops.flatMap((t) => t.positions.map((p) => frame.toLocal(p).u)))).toBeCloseTo(0, 5);
    });

    // Red if the side faces are no longer extended (the corner would open on the outside).
    it("still extends the side faces over the joined end", () => {
      const front = sideFaces(triangles, thick, 1);
      expect(sumArea(front)).toBeCloseTo(4.05 * HEIGHT, 4);
    });

    // Red if the cap logic is applied to seed corners wrongly: the seed's north wall has no caps and no top over its two joined ends.
    it("has neither caps nor top overhang at both joined ends of the seed's north wall", () => {
      const north = wallById("wall_north");
      const northFrame = localFrame(north);
      const northTriangles = getTriangles(buildWallGeometry(north, walls, openings, CEILING));
      const halfWidth = north.thickness / 2;
      const endCaps = northTriangles.filter((t) =>
        Math.abs(northFrame.dirToLocal(t.faceNormal).u) > 0.99
        && t.positions.every((p) => {
          const { u } = northFrame.toLocal(p);
          return Math.abs(u + halfWidth) < EPS || Math.abs(u - northFrame.length - halfWidth) < EPS;
        }));
      expect(endCaps).toHaveLength(0);
      const northTops = northTriangles.filter((t) => t.positions.every((p) => Math.abs(p.y - CEILING) < EPS) && t.faceNormal.y > 0.99);
      expect(sumArea(northTops)).toBeCloseTo(northFrame.length * north.thickness, 4);
      for (const t of northTops) for (const p of t.positions) {
        const { u } = northFrame.toLocal(p);
        expect(u).toBeGreaterThanOrEqual(-EPS);
        expect(u).toBeLessThanOrEqual(northFrame.length + EPS);
      }
    });
  });

  describe("openings keep their world position when ends are extended", () => {
    const wall = wallById("wall_north");
    const door = openingById("opening_front_door");
    const window = openingById("opening_kitchen_window_north");
    const geometry = buildWallGeometry(wall, walls, openings, CEILING);
    const triangles = getTriangles(geometry);
    const frame = localFrame(wall); // u counts from the original start (0.18, 0.18)

    // Red if the offset is measured from the extended start (holes would shift by 0.18 m).
    it("has hole corner vertices at world x = startX + offset", () => {
      const vertices = getVertices(geometry);
      for (const opening of [door, window]) {
        const rect = holeRect(opening);
        for (const u of [rect.u0, rect.u1]) {
          const x = wall.startX + u;
          const found = vertices.some((p) => Math.abs(p.x - x) < 1e-5 && Math.abs(p.y - rect.v1) < 1e-5);
          expect(found, `${opening.id} x=${x}`).toBe(true);
        }
      }
    });

    // Red if the hole area or the extended face area is wrong.
    it("removes exactly the hole areas from the extended front face", () => {
      const extendedLength = frame.length + wall.thickness;
      const expected = extendedLength * CEILING - holeArea(door) - holeArea(window);
      const front = triangles.filter((t) => t.positions.every((p) => Math.abs(p.z - (wall.startZ + wall.thickness / 2)) < EPS) && Math.abs(t.faceNormal.z) > 0.99);
      expect(sumArea(front)).toBeCloseTo(expected, 4);
    });

    // Red if any triangle covers the hole in world coordinates.
    it("leaves both holes open", () => {
      for (const opening of [door, window]) {
        const rect = holeRect(opening);
        const covering = triangles.filter((t) => {
          const u = t.centroid.x - wall.startX;
          return u > rect.u0 + EPS && u < rect.u1 - EPS && t.centroid.y > rect.v0 + EPS && t.centroid.y < rect.v1 - EPS;
        });
        expect(covering, opening.id).toHaveLength(0);
      }
    });
  });
});
