import { wallLength, type Opening, type Wall } from "@app/core";
import { wallDirection } from "./wallDirection.ts";
import { wallEndExtensions } from "./wallJoints.ts";
import { BufferGeometry, Float32BufferAttribute } from "three";

/** Wall-local coordinates: u along the centre line, v up, w across the thickness. u x v = w. */
type Local = [number, number, number];
type Hole = { u0: number; u1: number; v0: number; v1: number };
type Interval = [number, number];

const U_AXIS = 0;
const V_AXIS = 1;
const W_AXIS = 2;

/** Collects quads in wall-local space and writes them out as one indexed world-space geometry. */
class WallMesh {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  private readonly wall: Wall;

  constructor(wall: Wall) {
    this.wall = wall;
  }

  /** Adds a quad from `origin` spanned by `edgeA` and `edgeB`; its normal is edgeA x edgeB. */
  addQuad(origin: Local, edgeA: Local, edgeB: Local): void {
    const normal = crossLocal(edgeA, edgeB).map((component) => Math.sign(component)) as Local;
    const flatAxes = normal.findIndex((component) => component !== 0);
    // UVs use the two in-plane local axes, so one UV unit is one metre.
    const uvAxes = ([U_AXIS, V_AXIS, W_AXIS] as const).filter((axis) => axis !== flatAxes);
    const corners: Local[] = [
      origin,
      addLocal(origin, edgeA),
      addLocal(addLocal(origin, edgeA), edgeB),
      addLocal(origin, edgeB),
    ];
    const firstIndex = this.positions.length / 3;
    for (const corner of corners) {
      this.positions.push(...this.toWorld(corner));
      this.normals.push(...this.toWorldDirection(normal));
      this.uvs.push(corner[uvAxes[0]!], corner[uvAxes[1]!]);
    }
    this.indices.push(firstIndex, firstIndex + 1, firstIndex + 2, firstIndex, firstIndex + 2, firstIndex + 3);
  }

  toGeometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    return geometry;
  }

  private toWorld([u, v, w]: Local): Local {
    const [dirX, dirZ] = wallDirection(this.wall);
    return [this.wall.startX + u * dirX - w * dirZ, v, this.wall.startZ + u * dirZ + w * dirX];
  }

  private toWorldDirection([u, v, w]: Local): Local {
    const [dirX, dirZ] = wallDirection(this.wall);
    return [u * dirX - w * dirZ, v, u * dirZ + w * dirX];
  }
}

function addLocal(a: Local, b: Local): Local {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function crossLocal(a: Local, b: Local): Local {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

const alongU = (length: number): Local => [length, 0, 0];
const alongV = (length: number): Local => [0, length, 0];
const alongW = (length: number): Local => [0, 0, length];

function toHole(opening: Opening, length: number, ceilingHeight: number): Hole | null {
  const hole = {
    u0: Math.max(opening.offsetFromStart, 0),
    u1: Math.min(opening.offsetFromStart + opening.width, length),
    v0: Math.max(opening.sillHeight, 0),
    v1: Math.min(opening.sillHeight + opening.height, ceilingHeight),
  };
  return hole.u1 > hole.u0 && hole.v1 > hole.v0 ? hole : null;
}

/** Sorted, merged intervals. */
function mergeIntervals(intervals: Interval[]): Interval[] {
  const merged: Interval[] = [];
  for (const [start, end] of [...intervals].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** The parts of [start, end] not covered by the (merged) intervals. */
function subtractIntervals(start: number, end: number, covered: Interval[]): Interval[] {
  const free: Interval[] = [];
  let cursor = start;
  for (const [from, to] of covered) {
    if (from > cursor) free.push([cursor, Math.min(from, end)]);
    cursor = Math.max(cursor, to);
  }
  if (cursor < end) free.push([cursor, end]);
  return free.filter(([from, to]) => to > from);
}

/** Splits the wall face into rectangles: one vertical strip between neighbouring hole edges, minus the holes. */
function faceRectangles(span: Interval, height: number, holes: Hole[]): Hole[] {
  const breakpoints = [...new Set([span[0], span[1], ...holes.flatMap((hole) => [hole.u0, hole.u1])])].sort((a, b) => a - b);
  const rectangles: Hole[] = [];
  for (let i = 0; i + 1 < breakpoints.length; i += 1) {
    const u0 = breakpoints[i]!;
    const u1 = breakpoints[i + 1]!;
    const covering = holes.filter((hole) => hole.u0 <= u0 && hole.u1 >= u1).map((hole): Interval => [hole.v0, hole.v1]);
    for (const [v0, v1] of subtractIntervals(0, height, mergeIntervals(covering))) rectangles.push({ u0, u1, v0, v1 });
  }
  return rectangles;
}

function addFaces(mesh: WallMesh, rectangles: Hole[], halfThickness: number): void {
  for (const { u0, u1, v0, v1 } of rectangles) {
    const du = u1 - u0;
    const dv = v1 - v0;
    mesh.addQuad([u0, v0, halfThickness], alongU(du), alongV(dv));
    mesh.addQuad([u0, v0, -halfThickness], alongV(dv), alongU(du));
  }
}

/** Tops and bottoms of the span; the end caps are only added at free ends (a cap at a joined end would be coplanar with the joined wall's face). */
function addCaps(mesh: WallMesh, span: Interval, height: number, thickness: number, holes: Hole[], freeEnds: { start: boolean; end: boolean }): void {
  const halfThickness = thickness / 2;
  const bottomGaps = mergeIntervals(holes.filter((hole) => hole.v0 <= 0).map((hole): Interval => [hole.u0, hole.u1]));
  const topGaps = mergeIntervals(holes.filter((hole) => hole.v1 >= height).map((hole): Interval => [hole.u0, hole.u1]));
  for (const [u0, u1] of subtractIntervals(span[0], span[1], bottomGaps)) mesh.addQuad([u0, 0, -halfThickness], alongU(u1 - u0), alongW(thickness));
  for (const [u0, u1] of subtractIntervals(span[0], span[1], topGaps)) mesh.addQuad([u0, height, -halfThickness], alongW(thickness), alongU(u1 - u0));
  if (freeEnds.start) mesh.addQuad([span[0], 0, -halfThickness], alongW(thickness), alongV(height));
  if (freeEnds.end) mesh.addQuad([span[1], 0, -halfThickness], alongV(height), alongW(thickness));
}

function addReveals(mesh: WallMesh, hole: Hole, height: number, thickness: number): void {
  const { u0, u1, v0, v1 } = hole;
  const halfThickness = thickness / 2;
  mesh.addQuad([u0, v0, -halfThickness], alongV(v1 - v0), alongW(thickness));
  mesh.addQuad([u1, v0, -halfThickness], alongW(thickness), alongV(v1 - v0));
  if (v0 > 0) mesh.addQuad([u0, v0, -halfThickness], alongW(thickness), alongU(u1 - u0));
  if (v1 < height) mesh.addQuad([u0, v1, -halfThickness], alongU(u1 - u0), alongW(thickness));
}

/**
 * Wall box along the centre line with a rectangular hole (including reveals) for every opening of the
 * wall. Ends that join another wall of `walls` are extended and get no end cap (editor spec
 * section 7); opening offsets stay relative to the original start. UVs are in metres, normals point outwards, one index,
 * no groups.
 */
export function buildWallGeometry(wall: Wall, walls: Wall[], openings: Opening[], ceilingHeight: number): BufferGeometry {
  const length = wallLength(wall);
  const holes = openings
    .filter((opening) => opening.wallId === wall.id)
    .map((opening) => toHole(opening, length, ceilingHeight))
    .filter((hole) => hole !== null);

  const extensions = wallEndExtensions(wall, walls);
  const span: Interval = [-extensions.start, length + extensions.end];
  const mesh = new WallMesh(wall);
  addFaces(mesh, faceRectangles(span, ceilingHeight, holes), wall.thickness / 2);
  addCaps(mesh, span, ceilingHeight, wall.thickness, holes, { start: extensions.start === 0, end: extensions.end === 0 });
  for (const hole of holes) addReveals(mesh, hole, ceilingHeight, wall.thickness);
  return mesh.toGeometry();
}
