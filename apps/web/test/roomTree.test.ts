import { SEED_DOCUMENT } from "../../../packages/core/src/seed/index.ts";
import type { Opening, Room, Wall } from "@app/core";
import { describe, expect, it } from "vitest";
import { openingsOfWall, wallsOfRoom } from "../src/editor/roomTree.ts";

// Contract: docs/specs/editor.md section 4.2 (under each room its walls and openings). Room polygons follow the inner
// wall faces, i.e. they are inset by half the wall thickness from the wall centre lines.
const { rooms, walls, openings } = SEED_DOCUMENT.apartment;
const room = (id: string): Room => rooms.find((candidate) => candidate.id === id)!;
const wallIdsOf = (roomId: string): string[] => wallsOfRoom(room(roomId), walls).map((wall) => wall.id).sort();

// Walls bounding each seed room, worked out from the seed geometry (see the sketch in seed/document.ts).
const EXPECTED_WALLS: Record<string, string[]> = {
  room_bedroom: ["wall_bedroom_living", "wall_hallway_west", "wall_north", "wall_west"],
  room_living: ["wall_bedroom_living", "wall_hallway_west", "wall_south", "wall_west"],
  room_hallway: ["wall_hallway_east", "wall_hallway_west", "wall_north", "wall_south"],
  room_kitchen: ["wall_east", "wall_hallway_east", "wall_kitchen_bath", "wall_north"],
  room_bathroom: ["wall_east", "wall_hallway_east", "wall_kitchen_bath", "wall_south"],
};

describe("wallsOfRoom (seed apartment)", () => {
  // Red if a bounding wall is missed (tolerance too tight) or a neighbour's wall is listed (tolerance too wide).
  it.each(Object.entries(EXPECTED_WALLS))("lists exactly the bounding walls of %s", (roomId, expected) => {
    expect(wallIdsOf(roomId)).toEqual(expected);
  });

  // Red if the exterior walls (0.36 m, polygon inset 0.18 m) are not matched like the thin interior ones.
  it("lists each exterior wall for the rooms along it", () => {
    expect(wallIdsOf("room_kitchen")).toContain("wall_east");
    expect(wallIdsOf("room_bedroom")).toContain("wall_west");
  });

  // Red if the result is not a subset of the given walls, in their order.
  it("returns the given wall objects in input order", () => {
    const result = wallsOfRoom(room("room_bedroom"), walls);
    expect(result.map((wall) => wall.id)).toEqual(walls.filter((wall) => EXPECTED_WALLS.room_bedroom!.includes(wall.id)).map((wall) => wall.id));
    for (const wall of result) expect(wall).toBe(walls.find((candidate) => candidate.id === wall.id));
  });
});

describe("wallsOfRoom (synthetic)", () => {
  const square: Room = { id: "room_sq", name: "Square", polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] };
  const wall = (id: string, startX: number, startZ: number, endX: number, endZ: number, thickness = 0.1): Wall =>
    ({ id, startX, startZ, endX, endZ, thickness, exterior: false });

  // Red if a wall that is parallel but far from every edge is listed.
  it("ignores a parallel wall far from the room", () => {
    expect(wallsOfRoom(square, [wall("wall_far", 0, 2, 4, 2)])).toEqual([]);
  });

  // Red if the parallel check is dropped (a perpendicular wall ending at the edge is not a bounding wall).
  it("ignores a perpendicular wall that only touches an edge", () => {
    expect(wallsOfRoom(square, [wall("wall_perp", 2, 0, 2, 4)])).toEqual([]);
  });

  // Red if a mere corner contact counts as a shared length.
  it("ignores a collinear wall that only touches the edge at a corner", () => {
    expect(wallsOfRoom(square, [wall("wall_beyond", 4, 0, 8, 0)])).toEqual([]);
  });

  // Red if the overlap along the edge is not required.
  it("lists a wall that covers only part of an edge", () => {
    expect(wallsOfRoom(square, [wall("wall_part", 1, 0, 3, 0)]).map((w) => w.id)).toEqual(["wall_part"]);
  });

  // Red if the direction of the wall matters (walls may be drawn against the polygon winding).
  it("matches a wall drawn in the opposite direction", () => {
    expect(wallsOfRoom(square, [wall("wall_rev", 4, 0, 0, 0)]).map((w) => w.id)).toEqual(["wall_rev"]);
  });

  // Red if the closing edge (last point back to the first) is not examined.
  it("examines the closing edge of the polygon", () => {
    expect(wallsOfRoom(square, [wall("wall_closing", 0, 4, 0, 0)]).map((w) => w.id)).toEqual(["wall_closing"]);
  });

  // Red if the thickness is ignored: a thick wall centre line 0.3 m off still has its face on the edge.
  it("accounts for the wall thickness when measuring the distance", () => {
    expect(wallsOfRoom(square, [wall("wall_thick", 0, -0.3, 4, -0.3, 0.6)]).map((w) => w.id)).toEqual(["wall_thick"]);
    expect(wallsOfRoom(square, [wall("wall_thin", 0, -0.3, 4, -0.3, 0.1)])).toEqual([]);
  });

  // Red if a degenerate room crashes.
  it("returns nothing for no walls", () => {
    expect(wallsOfRoom(square, [])).toEqual([]);
  });
});

describe("openingsOfWall (seed apartment)", () => {
  const EXPECTED_OPENINGS: Record<string, string[]> = {
    wall_north: ["opening_front_door", "opening_kitchen_window_north"],
    wall_east: ["opening_kitchen_window_east"],
    wall_south: ["opening_balcony_door", "opening_bathroom_window", "opening_living_window_south"],
    wall_west: ["opening_bedroom_window", "opening_living_window_west"],
    wall_hallway_west: ["opening_bedroom_door", "opening_living_door"],
    wall_hallway_east: ["opening_bathroom_door", "opening_kitchen_door"],
    wall_bedroom_living: [],
    wall_kitchen_bath: [],
  };

  // Red if openings are matched on anything but the wall id, or one is lost or duplicated.
  it.each(Object.entries(EXPECTED_OPENINGS))("lists exactly the openings of %s", (wallId, expected) => {
    const wall = walls.find((candidate) => candidate.id === wallId)!;
    expect(openingsOfWall(wall, openings).map((opening) => opening.id).sort()).toEqual(expected);
  });

  // Red if some seed opening belongs to no wall of the tree (it would be invisible there).
  it("accounts for every seed opening exactly once across all walls", () => {
    const all = walls.flatMap((wall) => openingsOfWall(wall, openings).map((opening) => opening.id));
    expect(all.sort()).toEqual(openings.map((opening) => opening.id).sort());
  });

  // Red if the input order is not kept.
  it("keeps the input order and the opening objects", () => {
    const wall = walls.find((candidate) => candidate.id === "wall_south")!;
    const reversed: Opening[] = [...openings].reverse();
    const result = openingsOfWall(wall, reversed);
    expect(result).toEqual(reversed.filter((opening) => opening.wallId === "wall_south"));
    expect(result[0]).toBe(reversed.find((opening) => opening.id === result[0]!.id));
  });
});
