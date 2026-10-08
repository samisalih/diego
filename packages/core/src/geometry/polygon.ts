import type { Apartment, Opening, Wall } from "../schemas/apartment.ts";

export type Point = [number, number];

function signedArea(points: Point[]): number {
  return points.reduce((sum, [x1, z1], index) => {
    const [x2, z2] = points[(index + 1) % points.length]!;
    return sum + (x1 * z2 - x2 * z1);
  }, 0) / 2;
}

export function polygonArea(points: Point[]): number {
  return Math.abs(signedArea(points));
}

export function polygonCentroid(points: Point[]): Point {
  const area = signedArea(points);
  let sumX = 0;
  let sumZ = 0;
  points.forEach(([x1, z1], index) => {
    const [x2, z2] = points[(index + 1) % points.length]!;
    const cross = x1 * z2 - x2 * z1;
    sumX += (x1 + x2) * cross;
    sumZ += (z1 + z2) * cross;
  });
  return [sumX / (6 * area), sumZ / (6 * area)];
}

// Ray casting along +x.
export function pointInPolygon([x, z]: Point, points: Point[]): boolean {
  let inside = false;
  points.forEach(([x1, z1], index) => {
    const [x2, z2] = points[(index + points.length - 1) % points.length]!;
    if (z1 > z !== z2 > z && x < ((x2 - x1) * (z - z1)) / (z2 - z1) + x1) inside = !inside;
  });
  return inside;
}

export function wallLength(wall: Wall): number {
  return Math.hypot(wall.endX - wall.startX, wall.endZ - wall.startZ);
}

export function openingSegment(wall: Wall, opening: Opening): { start: Point; end: Point } {
  const length = wallLength(wall);
  const directionX = (wall.endX - wall.startX) / length;
  const directionZ = (wall.endZ - wall.startZ) / length;
  const pointAt = (distance: number): Point => [wall.startX + directionX * distance, wall.startZ + directionZ * distance];
  return { start: pointAt(opening.offsetFromStart), end: pointAt(opening.offsetFromStart + opening.width) };
}

export function roomForPoint(apartment: Apartment, x: number, z: number): string | null {
  return apartment.rooms.find((room) => pointInPolygon([x, z], room.polygon))?.id ?? null;
}
