import { pointInPolygon, polygonArea, type Room } from "@app/core";
import { SEED_DOCUMENT } from "../../../packages/core/src/seed/index.ts";
import { describe, expect, it } from "vitest";
import { buildCeilingGeometry, buildFloorGeometry } from "../src/scene/build/rooms.ts";
import { boundsOf, getTriangles, getVertices, hasOnlyFiniteValues, sumArea } from "./helpers/geometry.ts";

const CEILING = SEED_DOCUMENT.apartment.meta.ceilingHeight;
const living = SEED_DOCUMENT.apartment.rooms.find((room) => room.id === "room_living")!;

// L-shaped (concave) room: 4 x 4 square with a 2 x 2 notch cut out of the top right corner. Area 12.
const L_POLYGON: Room["polygon"] = [[0, 0], [2, 0], [2, 2], [4, 2], [4, 4], [0, 4]];
const lRoom = (polygon: Room["polygon"]): Room => ({ ...living, id: "room_l", polygon });

describe("buildFloorGeometry", () => {
  // Red if the polygon is not triangulated to the exact area.
  it("covers exactly the polygon area for the seed living room", () => {
    expect(sumArea(getTriangles(buildFloorGeometry(living)))).toBeCloseTo(polygonArea(living.polygon), 5);
  });

  // Red if the floor is not at y = 0 or not flat.
  it("lies flat at y = 0", () => {
    const { min, max } = boundsOf(buildFloorGeometry(living));
    expect(min.y).toBeCloseTo(0, 6);
    expect(max.y).toBeCloseTo(0, 6);
  });

  // Red if any vertex or winding normal points down (the floor would be culled from above).
  it("faces up in both vertex normals and winding order", () => {
    for (const t of getTriangles(buildFloorGeometry(living))) {
      expect(t.faceNormal.y).toBeGreaterThan(0.99);
      for (const normal of t.normals) expect(normal.y).toBeGreaterThan(0.99);
    }
  });

  // Red if UVs are anything other than world x/z in metres.
  it("uses world (x, z) as UV in metres", () => {
    const geometry = buildFloorGeometry(living);
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    expect(uv.count).toBe(position.count);
    for (let i = 0; i < position.count; i += 1) {
      expect(uv.getX(i)).toBeCloseTo(position.getX(i), 6);
      expect(uv.getY(i)).toBeCloseTo(position.getZ(i), 6);
    }
  });

  // Red if a concave polygon is triangulated as a convex fan (the notch would be covered).
  it("keeps the notch of a concave polygon empty", () => {
    const triangles = getTriangles(buildFloorGeometry(lRoom(L_POLYGON)));
    expect(sumArea(triangles)).toBeCloseTo(12, 5);
    for (const t of triangles) expect(pointInPolygon([t.centroid.x, t.centroid.z], L_POLYGON)).toBe(true);
  });

  // Red if the winding order of the input changes the result.
  it("does not depend on the input winding order", () => {
    const reversed = [...L_POLYGON].reverse() as Room["polygon"];
    for (const polygon of [L_POLYGON, reversed]) {
      const triangles = getTriangles(buildFloorGeometry(lRoom(polygon)));
      expect(sumArea(triangles)).toBeCloseTo(12, 5);
      for (const t of triangles) {
        expect(t.faceNormal.y).toBeGreaterThan(0.99);
        expect(pointInPolygon([t.centroid.x, t.centroid.z], L_POLYGON)).toBe(true);
      }
    }
  });

  // Red if the geometry contains NaN or reuses vertices out of the polygon.
  it("only uses vertices of the polygon", () => {
    const geometry = buildFloorGeometry(lRoom(L_POLYGON));
    expect(hasOnlyFiniteValues(geometry)).toBe(true);
    for (const vertex of getVertices(geometry)) {
      expect(L_POLYGON.some(([x, z]) => Math.abs(x - vertex.x) < 1e-6 && Math.abs(z - vertex.z) < 1e-6)).toBe(true);
    }
  });
});

describe("buildCeilingGeometry", () => {
  // Red if the ceiling is not at the ceiling height.
  it("lies flat at y = ceilingHeight", () => {
    const { min, max } = boundsOf(buildCeilingGeometry(living, CEILING));
    expect(min.y).toBeCloseTo(CEILING, 6);
    expect(max.y).toBeCloseTo(CEILING, 6);
  });

  // Red if the ceiling normal points up (it must face the room, i.e. down).
  it("faces down in both vertex normals and winding order", () => {
    for (const t of getTriangles(buildCeilingGeometry(living, CEILING))) {
      expect(t.faceNormal.y).toBeLessThan(-0.99);
      for (const normal of t.normals) expect(normal.y).toBeLessThan(-0.99);
    }
  });

  // Red if the ceiling polygon differs from the floor polygon.
  it("covers the same concave polygon as the floor, for either winding", () => {
    const reversed = [...L_POLYGON].reverse() as Room["polygon"];
    for (const polygon of [L_POLYGON, reversed]) {
      const triangles = getTriangles(buildCeilingGeometry(lRoom(polygon), 2.5));
      expect(sumArea(triangles)).toBeCloseTo(12, 5);
      for (const t of triangles) expect(pointInPolygon([t.centroid.x, t.centroid.z], L_POLYGON)).toBe(true);
    }
  });

  // Red if UVs are anything other than world x/z in metres.
  it("uses world (x, z) as UV in metres", () => {
    const geometry = buildCeilingGeometry(living, CEILING);
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < position.count; i += 1) {
      expect(uv.getX(i)).toBeCloseTo(position.getX(i), 6);
      expect(uv.getY(i)).toBeCloseTo(position.getZ(i), 6);
    }
  });
});
