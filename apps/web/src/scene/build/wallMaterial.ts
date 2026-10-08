import { wallLength, type Room, type Wall } from "@app/core";
import { wallDirection } from "./wallDirection.ts";

// Room polygons follow the inner wall faces, so a bounding edge lies up to half a wall thickness off the centre line.
const EDGE_TOLERANCE = 0.02;

function distanceToWallLine(wall: Wall, [x, z]: [number, number]): number {
  const [dirX, dirZ] = wallDirection(wall);
  return Math.abs((x - wall.startX) * dirZ - (z - wall.startZ) * dirX);
}

function alongWall(wall: Wall, [x, z]: [number, number]): number {
  const [dirX, dirZ] = wallDirection(wall);
  return (x - wall.startX) * dirX + (z - wall.startZ) * dirZ;
}

function edgeBoundsWall(wall: Wall, from: [number, number], to: [number, number]): boolean {
  const maxDistance = wall.thickness / 2 + EDGE_TOLERANCE;
  if (distanceToWallLine(wall, from) > maxDistance || distanceToWallLine(wall, to) > maxDistance) return false;
  const [low, high] = [alongWall(wall, from), alongWall(wall, to)].sort((a, b) => a - b) as [number, number];
  return high > EDGE_TOLERANCE && low < wallLength(wall) - EDGE_TOLERANCE && high - low > EDGE_TOLERANCE;
}

/** The wall material of the first room with a polygon edge along the wall; null when no room bounds it. */
export function findWallMaterialId(wall: Wall, rooms: Room[]): string | null {
  for (const room of rooms) {
    const isBoundingRoom = room.polygon.some((point, index) => edgeBoundsWall(wall, point, room.polygon[(index + 1) % room.polygon.length]!));
    if (isBoundingRoom) return room.wallMaterialId ?? null;
  }
  return null;
}
