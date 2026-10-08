import { resolveNumber, type Scope } from "../formula/evaluate.ts";
import type { FormulaError } from "../formula/parser.ts";
import { DEGREES_TO_RADIANS, type Vec3 } from "../math.ts";
import type { Asset, Part } from "../schemas/asset.ts";
import type { BoundingBox } from "../schemas/model.ts";
import { normalizeParams } from "./params.ts";

const MAX_REPEAT_COUNT = 200;
const SIZE_FALLBACK = 0.01;
const SIZE_FIELDS = new Set(["w", "h", "d"]);

type NumericPartField = "x" | "y" | "z" | "rx" | "ry" | "rz" | "w" | "h" | "d" | "bevel";
type FormulaPartField = NumericPartField | "repeat" | "light" | "fill" | "tube" | "profile";

export type ResolvedPart = Omit<Part, FormulaPartField> & Record<NumericPartField, number> & {
  light?: { lumens: number; kelvin: number; type: "point" | "spot" | "area" } | null;
  fill?: number;
  tube?: number;
  profile?: Array<[number, number]>;
};

export interface ResolveIssue {
  partId: string;
  field: string;
  error: FormulaError;
}

export interface ResolvedAsset {
  parts: ResolvedPart[];
  issues: ResolveIssue[];
  boundingBox: BoundingBox;
}

export interface AssetFootprint {
  halfWidth: number;
  halfDepth: number;
  centerX: number;
  centerZ: number;
  minY: number;
  maxY: number;
}

function resolvePart(part: Part, id: string, scope: Scope, issues: ResolveIssue[]): ResolvedPart {
  const resolveField = (field: string, value: number | string): number => {
    const result = resolveNumber(value, scope);
    if (result.ok) return result.value;
    // Repeated copies of a part fail identically; report each base part + field once.
    if (!issues.some((issue) => issue.partId === part.id && issue.field === field)) {
      issues.push({ partId: part.id, field, error: result.error });
    }
    return SIZE_FIELDS.has(field) ? SIZE_FALLBACK : 0;
  };
  const { repeat: _repeat, light, fill, tube, profile, ...rest } = part;
  const resolved = {
    ...rest,
    id,
    x: resolveField("x", part.x),
    y: resolveField("y", part.y),
    z: resolveField("z", part.z),
    rx: resolveField("rx", part.rx),
    ry: resolveField("ry", part.ry),
    rz: resolveField("rz", part.rz),
    w: resolveField("w", part.w),
    h: resolveField("h", part.h),
    d: resolveField("d", part.d),
    bevel: resolveField("bevel", part.bevel),
  } as ResolvedPart;
  if (light) {
    resolved.light = { ...light, lumens: resolveField("light.lumens", light.lumens), kelvin: resolveField("light.kelvin", light.kelvin) };
  }
  if (fill !== undefined) resolved.fill = resolveField("fill", fill);
  if (tube !== undefined) resolved.tube = resolveField("tube", tube);
  if (profile) {
    resolved.profile = profile.map(([u, v], index) => [resolveField(`profile[${index}][0]`, u), resolveField(`profile[${index}][1]`, v)]);
  }
  return resolved;
}

function resolveRepeatCount(part: Part, scope: Scope, issues: ResolveIssue[]): number | null {
  if (!part.repeat) return null;
  const result = resolveNumber(part.repeat.count, scope);
  if (!result.ok) {
    issues.push({ partId: part.id, field: "repeat.count", error: result.error });
    return 0;
  }
  return Math.min(Math.max(Math.floor(result.value), 0), MAX_REPEAT_COUNT);
}

function resolveParts(asset: Asset, values: Scope, issues: ResolveIssue[]): ResolvedPart[] {
  const baseScope: Scope = { ...values, pi: Math.PI };
  return asset.parts.flatMap((part) => {
    const count = resolveRepeatCount(part, baseScope, issues);
    if (count === null) return [resolvePart(part, part.id, baseScope, issues)];
    return Array.from({ length: count }, (_, i) =>
      resolvePart(part, `${part.id}#${i}`, { ...baseScope, i, count }, issues));
  });
}

// Half extents of the part's box after rotating it about its centre (Euler XYZ, degrees).
function rotatedHalfExtents(part: ResolvedPart): Vec3 {
  const [sx, sy, sz] = [part.rx, part.ry, part.rz].map((angle) => Math.sin(angle * DEGREES_TO_RADIANS)) as Vec3;
  const [cx, cy, cz] = [part.rx, part.ry, part.rz].map((angle) => Math.cos(angle * DEGREES_TO_RADIANS)) as Vec3;
  // R = Rx * Ry * Rz
  const matrix = [
    [cy * cz, -cy * sz, sy],
    [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
    [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
  ] as const;
  const half = [part.w / 2, part.h / 2, part.d / 2] as const;
  return matrix.map((row) => row.reduce((sum, entry, column) => sum + Math.abs(entry) * half[column]!, 0)) as Vec3;
}

function computeBoundingBox(parts: ResolvedPart[]): BoundingBox {
  if (parts.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    const centre: Vec3 = [part.x, part.y, part.z];
    const half = rotatedHalfExtents(part);
    for (const axis of [0, 1, 2] as const) {
      min[axis] = Math.min(min[axis], centre[axis] - half[axis]);
      max[axis] = Math.max(max[axis], centre[axis] + half[axis]);
    }
  }
  return { min, max };
}

export function resolveAsset(asset: Asset, values: Record<string, number> = {}): ResolvedAsset {
  const issues: ResolveIssue[] = [];
  const parts = resolveParts(asset, normalizeParams(asset.params, values).values, issues);
  return { parts, issues, boundingBox: computeBoundingBox(parts) };
}

export function assetFootprint({ boundingBox: { min, max } }: ResolvedAsset): AssetFootprint {
  return {
    halfWidth: (max[0] - min[0]) / 2,
    halfDepth: (max[2] - min[2]) / 2,
    centerX: (min[0] + max[0]) / 2,
    centerZ: (min[2] + max[2]) / 2,
    minY: min[1],
    maxY: max[1],
  };
}
