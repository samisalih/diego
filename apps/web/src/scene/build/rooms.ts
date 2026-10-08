import type { Room } from "@app/core";
import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";

type Triangle = [number, number, number];

/** Orients a triangle so that its world normal (plan x/z mapped to world x/z) points up or down. */
function orientTriangle(contour: Vector2[], [a, b, c]: Triangle, facesUp: boolean): Triangle {
  const pa = contour[a]!;
  const pb = contour[b]!;
  const pc = contour[c]!;
  const planCross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
  // The world y component of the winding normal is the negative of the plan cross product.
  const normalIsUp = planCross < 0;
  return normalIsUp === facesUp ? [a, b, c] : [a, c, b];
}

function buildFlatGeometry(room: Room, y: number, facesUp: boolean): BufferGeometry {
  const contour = room.polygon.map(([x, z]) => new Vector2(x, z));
  const triangles = ShapeUtils.triangulateShape(contour, []) as Triangle[];

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(contour.flatMap((point) => [point.x, y, point.y]), 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(contour.flatMap(() => [0, facesUp ? 1 : -1, 0]), 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(contour.flatMap((point) => [point.x, point.y]), 2));
  geometry.setIndex(triangles.flatMap((triangle) => orientTriangle(contour, triangle, facesUp)));
  return geometry;
}

/** Flat floor polygon at y = 0 facing up, UVs are world (x, z) in metres. */
export function buildFloorGeometry(room: Room): BufferGeometry {
  return buildFlatGeometry(room, 0, true);
}

/** Flat ceiling polygon at `ceilingHeight` facing down, UVs are world (x, z) in metres. */
export function buildCeilingGeometry(room: Room, ceilingHeight: number): BufferGeometry {
  return buildFlatGeometry(room, ceilingHeight, false);
}
