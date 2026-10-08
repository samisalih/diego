import { wallLength, type Wall } from "@app/core";
import { wallDirection } from "./wallDirection.ts";

// An end counts as joined when it lies this close to another wall's end point or centre line.
const JOIN_TOLERANCE_M = 0.001;

type Point = [number, number];

function distanceToCentreLine(point: Point, wall: Wall): number {
  const [dirX, dirZ] = wallDirection(wall);
  const length = wallLength(wall);
  const relX = point[0] - wall.startX;
  const relZ = point[1] - wall.startZ;
  const along = Math.min(Math.max(relX * dirX + relZ * dirZ, 0), length);
  return Math.hypot(relX - dirX * along, relZ - dirZ * along);
}

function isJoined(point: Point, wall: Wall, walls: Wall[]): boolean {
  return walls.some((other) => other.id !== wall.id && distanceToCentreLine(point, other) <= JOIN_TOLERANCE_M);
}

/** How far each end of the wall is extended along its direction: half its own thickness where it joins another wall, else 0. */
export function wallEndExtensions(wall: Wall, walls: Wall[]): { start: number; end: number } {
  const half = wall.thickness / 2;
  return {
    start: isJoined([wall.startX, wall.startZ], wall, walls) ? half : 0,
    end: isJoined([wall.endX, wall.endZ], wall, walls) ? half : 0,
  };
}
