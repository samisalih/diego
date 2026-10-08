import type { ResolvedPart } from "@app/core";
import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Size = { w: number; h: number; d: number };

const MIN_SIZE = 0.01;
const ROUND_SEGMENTS = 3;
const CURVE_SEGMENTS = 32;
const CUSHION_PLATE_SEGMENTS = 8;
const CUSHION_BULGE_REFERENCE_HEIGHT = 0.1;
const DEFAULT_CUSHION_FILL = 0.5;
// RoundedBoxGeometry collapses to degenerate corner points with radius 0, so cushions keep a hairline radius.
const MIN_CUSHION_RADIUS = 0.002;
const FLAT_NORMAL_THRESHOLD = 0.999999;

function clampSize(part: ResolvedPart): Size {
  return { w: Math.max(part.w, MIN_SIZE), h: Math.max(part.h, MIN_SIZE), d: Math.max(part.d, MIN_SIZE) };
}

function bevelRadius(bevel: number, { w, h, d }: Size): number {
  return Math.min(bevel, w / 2, h / 2, d / 2);
}

function buildBox({ w, h, d }: Size, bevel: number): BufferGeometry {
  const radius = bevelRadius(bevel, { w, h, d });
  return radius > 0 ? new RoundedBoxGeometry(w, h, d, ROUND_SEGMENTS, radius) : new BoxGeometry(w, h, d);
}

function buildCylinder({ w, h, d }: Size): BufferGeometry {
  return new CylinderGeometry(0.5, 0.5, h, CURVE_SEGMENTS).scale(w, 1, d);
}

function buildSphere({ w, h, d }: Size): BufferGeometry {
  return new SphereGeometry(0.5, CURVE_SEGMENTS, CURVE_SEGMENTS / 2).scale(w, h, d);
}

function buildCapsule({ w, h, d }: Size): BufferGeometry {
  const radius = Math.min(w, d, h) / 2;
  return new CapsuleGeometry(radius, h - 2 * radius, 6, 16);
}

function buildTorus({ w, h, d }: Size, tube: number | undefined): BufferGeometry {
  const tubeRadius = Math.min(tube ?? h / 2, w / 2, d / 2);
  const ringRadius = w / 2 - tubeRadius;
  // The ring is built circular along w and stretched along z to reach the outer extent d.
  return new TorusGeometry(ringRadius, tubeRadius, 12, 48).rotateX(Math.PI / 2).scale(1, 1, d / w);
}

function buildPlane({ w, d }: Size): BufferGeometry {
  return new PlaneGeometry(w, d).rotateX(-Math.PI / 2);
}

function hasProfile(profile: ResolvedPart["profile"], minPoints: number): profile is Array<[number, number]> {
  return profile !== undefined && profile.length >= minPoints;
}

function buildLathe({ w, h }: Size, profile: ResolvedPart["profile"]): BufferGeometry {
  const points = hasProfile(profile, 2)
    ? profile.map(([radius, y]) => new Vector2(Math.max(radius, 0), y - h / 2))
    : [new Vector2(w / 2, -h / 2), new Vector2(w / 2, h / 2)];
  return new LatheGeometry(points, CURVE_SEGMENTS);
}

function buildExtrude({ w, h, d }: Size, profile: ResolvedPart["profile"]): BufferGeometry {
  const outline = hasProfile(profile, 3)
    ? profile
    : [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const shape = new Shape(outline.map(([x, y]) => new Vector2(x, y)));
  return new ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}

/** Drops the two triangles of the flat middle cell of a rounded box's top and bottom face. */
function dropFlatCaps(geometry: BufferGeometry): BufferGeometry {
  const normal = geometry.getAttribute("normal");
  const keptVertices: number[] = [];
  for (let first = 0; first < normal.count; first += 3) {
    const isFlatCap = [0, 1, 2].every((offset) => Math.abs(normal.getY(first + offset)) > FLAT_NORMAL_THRESHOLD);
    if (!isFlatCap) keptVertices.push(first, first + 1, first + 2);
  }
  const copyAttribute = (name: "position" | "normal" | "uv") => {
    const attribute = geometry.getAttribute(name);
    const values = keptVertices.flatMap((vertex) => Array.from({ length: attribute.itemSize }, (_, component) => attribute.getComponent(vertex, component)));
    return new Float32BufferAttribute(values, attribute.itemSize);
  };
  const result = new BufferGeometry();
  for (const name of ["position", "normal", "uv"] as const) result.setAttribute(name, copyAttribute(name));
  return result;
}

/** A dome over the flat cap that is zero in value and slope at the cap's edge, so it joins the rounded rim. */
function buildCushionPlate(halfWidth: number, halfDepth: number, y: number, bulge: number, facesUp: boolean): BufferGeometry {
  const plate = new PlaneGeometry(2 * halfWidth, 2 * halfDepth, CUSHION_PLATE_SEGMENTS, CUSHION_PLATE_SEGMENTS);
  plate.rotateX(facesUp ? -Math.PI / 2 : Math.PI / 2);
  const position = plate.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    const dome = Math.cos((Math.PI * position.getX(i)) / (2 * halfWidth)) ** 2 * Math.cos((Math.PI * position.getZ(i)) / (2 * halfDepth)) ** 2;
    position.setY(i, y + (facesUp ? bulge : -bulge) * dome);
  }
  plate.computeVertexNormals();
  return plate.toNonIndexed();
}

function buildCushion({ w, h, d }: Size, bevel: number, fill: number): BufferGeometry {
  const radius = Math.max(bevelRadius(bevel, { w, h, d }), MIN_CUSHION_RADIUS);
  const rounded = new RoundedBoxGeometry(w, h, d, ROUND_SEGMENTS, radius);
  const flatHalfWidth = w / 2 - radius;
  const flatHalfDepth = d / 2 - radius;
  if (flatHalfWidth <= 0 || flatHalfDepth <= 0) return rounded;

  const bulge = (fill * Math.min(h, CUSHION_BULGE_REFERENCE_HEIGHT)) / 2;
  const merged = mergeGeometries([
    dropFlatCaps(rounded),
    buildCushionPlate(flatHalfWidth, flatHalfDepth, h / 2, bulge, true),
    buildCushionPlate(flatHalfWidth, flatHalfDepth, -h / 2, bulge, false),
  ]);
  return merged ?? rounded;
}

/**
 * Geometry for one resolved part, sized to its w x h x d box and centred on the origin
 * (cushions bulge slightly beyond h). Never throws; sizes <= 0 are clamped to 0.01 m.
 */
export function buildPartGeometry(part: ResolvedPart): BufferGeometry {
  const size = clampSize(part);
  switch (part.shape) {
    case "box":
      return buildBox(size, part.bevel);
    case "cylinder":
      return buildCylinder(size);
    case "sphere":
      return buildSphere(size);
    case "capsule":
      return buildCapsule(size);
    case "torus":
      return buildTorus(size, part.tube);
    case "plane":
      return buildPlane(size);
    case "cushion":
      return buildCushion(size, part.bevel, part.fill ?? DEFAULT_CUSHION_FILL);
    case "lathe":
      return buildLathe(size, part.profile);
    case "extrude":
      return buildExtrude(size, part.profile);
    case "model":
      return new BoxGeometry(size.w, size.h, size.d);
  }
}

const formatNumber = (value: number | undefined): string => (value === undefined ? "" : String(Number(value.toFixed(6))));

/** Stable cache key from the shape and every number that influences `buildPartGeometry`. */
export function buildPartGeometryKey(part: ResolvedPart): string {
  const profile = part.profile?.map(([a, b]) => `${formatNumber(a)}:${formatNumber(b)}`).join(",") ?? "";
  const numbers = [part.w, part.h, part.d, part.bevel, part.fill, part.tube].map(formatNumber);
  return [part.shape, ...numbers, profile].join("|");
}
