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
  describe("plain wall without openings", () => {
    const wall = wallById("wall_kitchen_bath");
    const geometry = buildWallGeometry(wall, openings, CEILING);

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
      for (const vertex of getVertices(buildWallGeometry(diagonal, [], 2.5))) {
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
    const geometry = buildWallGeometry(wall, openings, CEILING);
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
      const triangles = getTriangles(buildWallGeometry(wall, openings, CEILING));
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
      const reveals = getTriangles(buildWallGeometry(wall, openings, CEILING)).filter((t) => {
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
      const triangles = getTriangles(buildWallGeometry(wall, openings, CEILING));
      const expected = frame.length * CEILING - wallOpenings.reduce((sum, opening) => sum + holeArea(opening), 0);
      expect(sumArea(sideFaces(triangles, wall, 1))).toBeCloseTo(expected, 4);
      expect(wallOpenings).toHaveLength(2);
    });

    // Red if the hole is not clamped to the ceiling (hole area would be bigger than the wall allows).
    it("clamps a hole that would exceed the ceiling", () => {
      const wall = wallById("wall_north");
      const door = openingById("opening_front_door");
      const lowCeiling = 2;
      const triangles = getTriangles(buildWallGeometry(wall, [door], lowCeiling));
      const expected = wallLength(wall) * lowCeiling - holeArea(door, lowCeiling);
      expect(sumArea(sideFaces(triangles, wall, 1))).toBeCloseTo(expected, 4);
      expect(boundsOf(buildWallGeometry(wall, [door], lowCeiling)).max.y).toBeCloseTo(lowCeiling, 5);
    });
  });

  describe("UVs and normals", () => {
    const wall = wallById("wall_north");
    const triangles = getTriangles(buildWallGeometry(wall, openings, CEILING));

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
      const shortTriangles = getTriangles(buildWallGeometry(short, [], CEILING));
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
});
