import type { Wall } from "../schemas/apartment.ts";
import type { Vec2 } from "../math.ts";
import { wallLength } from "./polygon.ts";

// Local x axis = (cos angle, -sin angle), local z axis = (sin angle, cos angle), like the item rotation.
export interface Obb {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  angle: number;
}

export function dot(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

export function obbAxes({ angle }: Obb): [Vec2, Vec2] {
  return [
    [Math.cos(angle), -Math.sin(angle)],
    [Math.sin(angle), Math.cos(angle)],
  ];
}

export function projectionRadius(obb: Obb, axis: Vec2): number {
  const [axisX, axisZ] = obbAxes(obb);
  return obb.hx * Math.abs(dot(axisX, axis)) + obb.hz * Math.abs(dot(axisZ, axis));
}

// Gap between the projections on one axis; negative when they overlap.
export function axisSeparation(a: Obb, b: Obb, axis: Vec2): number {
  const centreDistance = Math.abs(dot([b.cx - a.cx, b.cz - a.cz], axis));
  return centreDistance - projectionRadius(a, axis) - projectionRadius(b, axis);
}

export function obbIntersects(a: Obb, b: Obb, tolerance = 0.001): boolean {
  return [...obbAxes(a), ...obbAxes(b)].every((axis) => axisSeparation(a, b, axis) < -tolerance);
}

function corners(obb: Obb): Vec2[] {
  const [axisX, axisZ] = obbAxes(obb);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([signX, signZ]) => [
    obb.cx + signX * obb.hx * axisX[0] + signZ * obb.hz * axisZ[0],
    obb.cz + signX * obb.hx * axisX[1] + signZ * obb.hz * axisZ[1],
  ]);
}

function pointSegmentDistance(point: Vec2, start: Vec2, end: Vec2): number {
  const edge: Vec2 = [end[0] - start[0], end[1] - start[1]];
  const along = dot([point[0] - start[0], point[1] - start[1]], edge) / dot(edge, edge);
  const t = Math.min(Math.max(along, 0), 1);
  return Math.hypot(point[0] - (start[0] + t * edge[0]), point[1] - (start[1] + t * edge[1]));
}

function cornersToEdgesDistance(from: Obb, to: Obb): number {
  const toCorners = corners(to);
  return Math.min(
    ...corners(from).flatMap((corner) =>
      toCorners.map((start, index) => pointSegmentDistance(corner, start, toCorners[(index + 1) % 4]!)),
    ),
  );
}

// Disjoint rectangles are closest at a corner of one against an edge of the other.
export function obbDistance(a: Obb, b: Obb): number {
  if (obbIntersects(a, b, 0)) return 0;
  return Math.min(cornersToEdgesDistance(a, b), cornersToEdgesDistance(b, a));
}

// The part of a wall between two distances from its start.
export function wallSpanObb(wall: Wall, from: number, to: number): Obb {
  const length = wallLength(wall);
  const middle = (from + to) / 2;
  return {
    cx: wall.startX + ((wall.endX - wall.startX) / length) * middle,
    cz: wall.startZ + ((wall.endZ - wall.startZ) / length) * middle,
    hx: (to - from) / 2,
    hz: wall.thickness / 2,
    angle: Math.atan2(-(wall.endZ - wall.startZ), wall.endX - wall.startX),
  };
}

export function wallObb(wall: Wall): Obb {
  return wallSpanObb(wall, 0, wallLength(wall));
}
