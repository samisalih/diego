import { wallLength, type Wall } from "@app/core";
import { wallDirection } from "./wallDirection.ts";

// An end counts as joined when it lies this close to another wall's end point or centre line.
const JOIN_TOLERANCE_M = 0.001;

type Point = [number, number];

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function distanceToCentreLine(point: Point, wall: Wall): number {
  const [dirX, dirZ] = wallDirection(wall);
  const length = wallLength(wall);
  const relX = point[0] - wall.startX;
  const relZ = point[1] - wall.startZ;
  const along = Math.min(Math.max(relX * dirX + relZ * dirZ, 0), length);
  return Math.hypot(relX - dirX * along, relZ - dirZ * along);
}

function meetsEndPoint(point: Point, other: Wall): boolean {
  return distanceBetween(point, [other.startX, other.startZ]) <= JOIN_TOLERANCE_M || distanceBetween(point, [other.endX, other.endZ]) <= JOIN_TOLERANCE_M;
}

// L-joint (end meets end point): half the other wall's thickness. T-joint (end on the centre line): min(own, other) / 2.
function extensionAt(point: Point, wall: Wall, other: Wall): number {
  if (meetsEndPoint(point, other)) return other.thickness / 2;
  if (distanceToCentreLine(point, other) <= JOIN_TOLERANCE_M) return Math.min(wall.thickness, other.thickness) / 2;
  return 0;
}

function endExtension(point: Point, wall: Wall, walls: Wall[]): number {
  const others = walls.filter((other) => other.id !== wall.id);
  return Math.max(0, ...others.map((other) => extensionAt(point, wall, other)));
}

/** How far each end of the wall is extended along its direction (editor spec section 7); 0 means a free end. */
export function wallEndExtensions(wall: Wall, walls: Wall[]): { start: number; end: number } {
  return {
    start: endExtension([wall.startX, wall.startZ], wall, walls),
    end: endExtension([wall.endX, wall.endZ], wall, walls),
  };
}
