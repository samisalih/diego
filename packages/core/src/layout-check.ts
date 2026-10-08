import { assetFootprint, resolveAsset, type AssetFootprint } from "./asset/resolve.ts";
import { itemObb } from "./geometry/footprint.ts";
import {
  axisSeparation,
  dot,
  obbAxes,
  obbDistance,
  obbIntersects,
  projectionRadius,
  wallObb,
  wallSpanObb,
  type Obb,
  type Vec2,
} from "./geometry/obb.ts";
import { pointInPolygon, roomForPoint, wallLength } from "./geometry/polygon.ts";
import type { Asset } from "./schemas/asset.ts";
import type { Apartment, Opening, Wall } from "./schemas/apartment.ts";
import type { DocumentContent } from "./schemas/document.ts";
import type { Item } from "./schemas/item.ts";

const ISSUE_KINDS = [
  "collision",
  "narrowPassage",
  "blockedOpening",
  "outsideRoom",
  "clampedParam",
  "adjustedParam",
  "unknownAsset",
] as const;

export type LayoutIssue = {
  kind: (typeof ISSUE_KINDS)[number];
  subjectId: string;
  objectId: string | null;
  value: number | null;
  detail: string | null;
};

const NARROW_GAP_MIN_M = 0.3;
const NARROW_GAP_MAX_M = 0.8;
const NARROW_FACING_OVERLAP_MIN_M = 0.3;
const DOOR_CLEARANCE_DEPTH_M = 0.8;
const WINDOW_CLEARANCE_DEPTH_M = 0.4;
const WINDOW_CLEARANCE_MIN_HEIGHT_ABOVE_SILL_M = 0.1;
const ROOM_SIDE_PROBE_DISTANCE_M = 0.1;
const PARAM_EPSILON = 1e-9;
// Gaps are rounded to micrometres so float noise cannot flip the 0.3 / 0.8 m boundaries.
const GAP_PRECISION = 1e6;

type PlacedItem = { item: Item; asset: Asset; footprint: AssetFootprint; obb: Obb };
type Obstacle = { id: string; obb: Obb; itemId: string | null };

function issue(kind: LayoutIssue["kind"], subjectId: string, fields: Partial<LayoutIssue> = {}): LayoutIssue {
  return { kind, subjectId, objectId: null, value: null, detail: null, ...fields };
}

function placeItems(items: Item[], assets: Map<string, Asset>): { placed: PlacedItem[]; unknown: Item[] } {
  const placed: PlacedItem[] = [];
  const unknown: Item[] = [];
  for (const item of items.filter((candidate) => !candidate.hidden)) {
    const asset = assets.get(item.assetId);
    if (!asset) {
      unknown.push(item);
      continue;
    }
    const footprint = assetFootprint(resolveAsset(asset, item.params));
    placed.push({ item, asset, footprint, obb: itemObb(item, footprint) });
  }
  return { placed, unknown };
}

// The wall minus the spans of its openings, so standing in a door is not a collision.
function solidWallParts(wall: Wall, openings: Opening[]): Obb[] {
  const spans = openings
    .filter((opening) => opening.wallId === wall.id)
    .sort((a, b) => a.offsetFromStart - b.offsetFromStart);
  const parts: Obb[] = [];
  let cursor = 0;
  for (const opening of spans) {
    if (opening.offsetFromStart > cursor) parts.push(wallSpanObb(wall, cursor, opening.offsetFromStart));
    cursor = Math.max(cursor, opening.offsetFromStart + opening.width);
  }
  if (cursor < wallLength(wall)) parts.push(wallSpanObb(wall, cursor, wallLength(wall)));
  return parts;
}

function findCollisions(placed: PlacedItem[], apartment: Apartment): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  placed.forEach((first, index) => {
    for (const second of placed.slice(index + 1)) {
      if (!obbIntersects(first.obb, second.obb)) continue;
      const [subjectId, objectId] = [first.item.id, second.item.id].sort() as [string, string];
      issues.push(issue("collision", subjectId, { objectId }));
    }
    for (const wall of apartment.walls) {
      const hitsWall = solidWallParts(wall, apartment.openings).some((part) => obbIntersects(first.obb, part));
      if (hitsWall) issues.push(issue("collision", first.item.id, { objectId: wall.id }));
    }
  });
  return issues;
}

// Facing sides: the axis with the widest gap is the gap direction, the overlap is measured across it.
function facingOverlap(a: Obb, b: Obb): number {
  const gapAxis = [...obbAxes(a), ...obbAxes(b)].reduce((best, axis) =>
    axisSeparation(a, b, axis) > axisSeparation(a, b, best) ? axis : best,
  );
  const across: Vec2 = [-gapAxis[1], gapAxis[0]];
  const centreA = dot([a.cx, a.cz], across);
  const centreB = dot([b.cx, b.cz], across);
  const radiusA = projectionRadius(a, across);
  const radiusB = projectionRadius(b, across);
  return Math.min(centreA + radiusA, centreB + radiusB) - Math.max(centreA - radiusA, centreB - radiusB);
}

function findNarrowPassages(placed: PlacedItem[], apartment: Apartment): LayoutIssue[] {
  const items: Obstacle[] = placed.map(({ item, obb }) => ({ id: item.id, obb, itemId: item.id }));
  const walls: Obstacle[] = apartment.walls.map((wall) => ({ id: wall.id, obb: wallObb(wall), itemId: null }));
  const issues: LayoutIssue[] = [];
  const consider = (first: Obstacle, second: Obstacle, subjectId: string, objectId: string) => {
    const gap = Math.round(obbDistance(first.obb, second.obb) * GAP_PRECISION) / GAP_PRECISION;
    if (gap < NARROW_GAP_MIN_M || gap >= NARROW_GAP_MAX_M) return;
    if (facingOverlap(first.obb, second.obb) < NARROW_FACING_OVERLAP_MIN_M) return;
    issues.push(issue("narrowPassage", subjectId, { objectId, value: gap }));
  };
  items.forEach((first, index) => {
    for (const second of items.slice(index + 1)) {
      const [subjectId, objectId] = [first.id, second.id].sort() as [string, string];
      consider(first, second, subjectId, objectId);
    }
    for (const wall of walls) consider(first, wall, first.id, wall.id);
  });
  return issues;
}

// Sides (+1 / -1 along the wall's local z axis) that have a room polygon next to the opening.
function roomSides(zone: Obb, wall: Wall, apartment: Apartment): number[] {
  const [, normal] = obbAxes(zone);
  const probeDistance = wall.thickness / 2 + ROOM_SIDE_PROBE_DISTANCE_M;
  return [1, -1].filter((side) => {
    const probe: [number, number] = [zone.cx + normal[0] * side * probeDistance, zone.cz + normal[1] * side * probeDistance];
    return apartment.rooms.some((room) => pointInPolygon(probe, room.polygon));
  });
}

function clearanceZone(span: Obb, wall: Wall, side: number, depth: number): Obb {
  const [, normal] = obbAxes(span);
  const offset = side * (wall.thickness / 2 + depth / 2);
  return { ...span, cx: span.cx + normal[0] * offset, cz: span.cz + normal[1] * offset, hz: depth / 2 };
}

function findBlockedOpenings(placed: PlacedItem[], apartment: Apartment): LayoutIssue[] {
  const wallsById = new Map(apartment.walls.map((wall) => [wall.id, wall]));
  return apartment.openings.flatMap((opening) => {
    const wall = wallsById.get(opening.wallId);
    if (!wall) return [];
    const isWindow = opening.type === "window";
    const span = wallSpanObb(wall, opening.offsetFromStart, opening.offsetFromStart + opening.width);
    const sides = isWindow || wall.exterior ? roomSides(span, wall, apartment) : [1, -1];
    const depth = isWindow ? WINDOW_CLEARANCE_DEPTH_M : DOOR_CLEARANCE_DEPTH_M;
    const zones = sides.map((side) => clearanceZone(span, wall, side, depth));
    const minHeight = opening.sillHeight + WINDOW_CLEARANCE_MIN_HEIGHT_ABOVE_SILL_M;
    return placed
      .filter(({ footprint }) => !isWindow || footprint.maxY > minHeight)
      .filter(({ obb }) => zones.some((zone) => obbIntersects(obb, zone)))
      .map(({ item }) => issue("blockedOpening", opening.id, { objectId: item.id }));
  });
}

function findParamIssues({ item, asset }: PlacedItem): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  if (item.clampedParams && item.clampedParams.length > 0) {
    issues.push(issue("clampedParam", item.id, { detail: item.clampedParams.join(",") }));
  }
  const adjustedKeys = asset.params
    .filter((param) => Math.abs((item.params[param.key] ?? param.default) - param.default) > PARAM_EPSILON)
    .map((param) => param.key);
  if (adjustedKeys.length > 0) issues.push(issue("adjustedParam", item.id, { detail: adjustedKeys.join(",") }));
  return issues;
}

function compareIssues(a: LayoutIssue, b: LayoutIssue): number {
  const byKind = ISSUE_KINDS.indexOf(a.kind) - ISSUE_KINDS.indexOf(b.kind);
  if (byKind !== 0) return byKind;
  if (a.subjectId !== b.subjectId) return a.subjectId < b.subjectId ? -1 : 1;
  const [objectA, objectB] = [a.objectId ?? "", b.objectId ?? ""];
  return objectA === objectB ? 0 : objectA < objectB ? -1 : 1;
}

export function checkLayout(content: DocumentContent, assets: Map<string, Asset>): LayoutIssue[] {
  const { apartment } = content;
  const { placed, unknown } = placeItems(content.items, assets);
  const outsideRoom = placed
    .filter(({ item }) => roomForPoint(apartment, item.x, item.z) === null)
    .map(({ item }) => issue("outsideRoom", item.id));
  return [
    ...findCollisions(placed, apartment),
    ...findNarrowPassages(placed, apartment),
    ...findBlockedOpenings(placed, apartment),
    ...outsideRoom,
    ...placed.flatMap(findParamIssues),
    ...unknown.map((item) => issue("unknownAsset", item.id)),
  ].sort(compareIssues);
}
