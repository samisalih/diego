import type { Opening, Room, Wall } from "../schemas/apartment.ts";
import type { Document } from "../schemas/document.ts";
import type { Item } from "../schemas/item.ts";

// Musterwohnung: a 2-room flat of about 55 m2 in Leipzig. Origin (0, 0) is the outer north-west corner,
// x runs east, z runs south. Exterior walls are 0.36 m, interior walls 0.11 m; wall centre lines sit
// half a wall thickness inside the outer faces and room polygons follow the inner wall faces.
//
//   +-----------+--------+---------+
//   | Schlaf-   |  Flur  | Küche   |
//   | zimmer    |        +---------+
//   +-----------+        | Bad     |
//   | Wohnzimmer|        |         |
//   +-----------+--------+---------+

const EXTERIOR_THICKNESS = 0.36;
const INTERIOR_THICKNESS = 0.11;
const FRAME_MATERIAL_ID = "mat_wall_paint";

const WEST = 0.18;
const EAST = 9.18;
const NORTH = 0.18;
const SOUTH = 7.18;
const HALLWAY_WEST_WALL_X = 5.1;
const HALLWAY_EAST_WALL_X = 6.605;
const BEDROOM_LIVING_WALL_Z = 3.35;
const KITCHEN_BATH_WALL_Z = 4.055;

function exteriorWall(id: string, startX: number, startZ: number, endX: number, endZ: number): Wall {
  return { id, startX, startZ, endX, endZ, thickness: EXTERIOR_THICKNESS, exterior: true };
}

function interiorWall(id: string, startX: number, startZ: number, endX: number, endZ: number): Wall {
  return { id, startX, startZ, endX, endZ, thickness: INTERIOR_THICKNESS, exterior: false };
}

function room(id: string, name: string, polygon: Room["polygon"], floorMaterialId: string, wallMaterialId = "mat_wall_paint"): Room {
  return { id, name, polygon, floorMaterialId, wallMaterialId, ceilingMaterialId: "mat_wall_paint" };
}

function opening(
  id: string,
  wallId: string,
  type: Opening["type"],
  [offsetFromStart, width, height, sillHeight]: [number, number, number, number],
): Opening {
  return { id, wallId, type, offsetFromStart, width, height, sillHeight, frameMaterialId: FRAME_MATERIAL_ID };
}

function item(id: string, assetId: string, x: number, z: number, rotation: number, name: string): Item {
  return { id, assetId, name, x, z, rotation, params: {}, locked: false, hidden: false, lightOn: true };
}

const walls: Wall[] = [
  exteriorWall("wall_north", WEST, NORTH, EAST, NORTH),
  exteriorWall("wall_east", EAST, NORTH, EAST, SOUTH),
  exteriorWall("wall_south", WEST, SOUTH, EAST, SOUTH),
  exteriorWall("wall_west", WEST, NORTH, WEST, SOUTH),
  interiorWall("wall_hallway_west", HALLWAY_WEST_WALL_X, NORTH, HALLWAY_WEST_WALL_X, SOUTH),
  interiorWall("wall_hallway_east", HALLWAY_EAST_WALL_X, NORTH, HALLWAY_EAST_WALL_X, SOUTH),
  interiorWall("wall_bedroom_living", WEST, BEDROOM_LIVING_WALL_Z, HALLWAY_WEST_WALL_X, BEDROOM_LIVING_WALL_Z),
  interiorWall("wall_kitchen_bath", HALLWAY_EAST_WALL_X, KITCHEN_BATH_WALL_Z, EAST, KITCHEN_BATH_WALL_Z),
];

const rooms: Room[] = [
  room("room_bedroom", "Schlafzimmer", [[0.36, 0.36], [5.045, 0.36], [5.045, 3.295], [0.36, 3.295]], "mat_oak_floorboards"),
  room("room_living", "Wohnzimmer", [[0.36, 3.405], [5.045, 3.405], [5.045, 7], [0.36, 7]], "mat_oak_floorboards"),
  room("room_hallway", "Flur", [[5.155, 0.36], [6.55, 0.36], [6.55, 7], [5.155, 7]], "mat_oak_floorboards"),
  room("room_kitchen", "Küche", [[6.66, 0.36], [9, 0.36], [9, 4], [6.66, 4]], "mat_tiles"),
  room("room_bathroom", "Bad", [[6.66, 4.11], [9, 4.11], [9, 7], [6.66, 7]], "mat_tiles", "mat_tiles"),
];

// offsetFromStart counts along the wall: west to east on north/south walls, north to south on the others.
const openings: Opening[] = [
  opening("opening_front_door", "wall_north", "door", [5.195, 0.95, 2.1, 0]),
  opening("opening_kitchen_window_north", "wall_north", "window", [7.12, 1.2, 1.3, 0.95]),
  opening("opening_kitchen_window_east", "wall_east", "window", [1.12, 1.2, 1.3, 0.95]),
  opening("opening_bedroom_window", "wall_west", "window", [0.72, 1.4, 1.4, 0.9]),
  opening("opening_living_window_west", "wall_west", "window", [4.12, 1.4, 1.4, 0.9]),
  opening("opening_living_window_south", "wall_south", "window", [0.62, 1.6, 1.4, 0.9]),
  opening("opening_balcony_door", "wall_south", "balconyDoor", [3.42, 0.9, 2.2, 0]),
  opening("opening_bathroom_window", "wall_south", "window", [7.42, 0.8, 0.8, 1.2]),
  opening("opening_bedroom_door", "wall_hallway_west", "door", [2.02, 0.9, 2.05, 0]),
  opening("opening_living_door", "wall_hallway_west", "door", [3.82, 0.9, 2.05, 0]),
  opening("opening_kitchen_door", "wall_hallway_east", "door", [2.52, 0.9, 2.05, 0]),
  opening("opening_bathroom_door", "wall_hallway_east", "door", [4.62, 0.8, 2, 0]),
];

// Rotation 0 faces south (+z); 90 faces east, 270 faces west.
const items: Item[] = [
  item("item_sofa", "asset_sofa", 2.3, 3.91, 0, "Sofa"),
  item("item_floor_lamp", "asset_floor_lamp", 0.8, 3.75, 0, "Stehlampe"),
  item("item_dining_table", "asset_dining_table", 2.7, 6.4, 0, "Esstisch"),
  item("item_chair_north_west", "asset_chair", 2.0, 5.6, 0, "Stuhl"),
  item("item_chair_north_east", "asset_chair", 3.4, 5.6, 0, "Stuhl"),
  item("item_shelf", "asset_shelf", 4.88, 5.6, 270, "Regal"),
  item("item_bed", "asset_bed_160", 2.4, 1.42, 0, "Bett"),
];

export const SEED_DOCUMENT: Document = {
  id: "doc_musterwohnung",
  name: "Musterwohnung",
  source: "user",
  apartment: {
    meta: {
      name: "Musterwohnung",
      ceilingHeight: 2.65,
      northAngle: 0,
      latitude: 51.34,
      longitude: 12.37,
      timeZone: "Europe/Berlin",
    },
    rooms,
    walls,
    openings,
  },
  items,
  lighting: { time: 16, season: "summer", effectsEnabled: false, lampShadowsEnabled: false, presetId: null },
};
