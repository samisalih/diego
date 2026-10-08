import { BufferAttribute, BufferGeometry, Vector2, Vector3 } from "three";

export interface Triangle {
  positions: [Vector3, Vector3, Vector3];
  normals: [Vector3, Vector3, Vector3];
  uvs: [Vector2, Vector2, Vector2];
  /** Normal from the winding order (counter-clockwise = front), normalised. */
  faceNormal: Vector3;
  centroid: Vector3;
  area: number;
}

/** Expands an indexed or non-indexed geometry into plain triangles. */
export function getTriangles(geometry: BufferGeometry): Triangle[] {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const normal = geometry.getAttribute("normal") as BufferAttribute;
  const uv = geometry.getAttribute("uv") as BufferAttribute;
  if (!position || !normal || !uv) throw new Error("geometry needs position, normal and uv attributes");
  const index = geometry.getIndex();
  const vertexCount = index ? index.count : position.count;
  const triangles: Triangle[] = [];
  for (let i = 0; i + 2 < vertexCount; i += 3) {
    const ids = [0, 1, 2].map((k) => (index ? index.getX(i + k) : i + k));
    const positions = ids.map((id) => new Vector3().fromBufferAttribute(position, id)) as Triangle["positions"];
    const normals = ids.map((id) => new Vector3().fromBufferAttribute(normal, id)) as Triangle["normals"];
    const uvs = ids.map((id) => new Vector2().fromBufferAttribute(uv, id)) as Triangle["uvs"];
    const cross = new Vector3().subVectors(positions[1], positions[0]).cross(new Vector3().subVectors(positions[2], positions[0]));
    const area = cross.length() / 2;
    const centroid = positions[0].clone().add(positions[1]).add(positions[2]).divideScalar(3);
    triangles.push({ positions, normals, uvs, faceNormal: area > 0 ? cross.clone().normalize() : cross, centroid, area });
  }
  return triangles;
}

export function getVertices(geometry: BufferGeometry): Vector3[] {
  const position = geometry.getAttribute("position") as BufferAttribute;
  return Array.from({ length: position.count }, (_, i) => new Vector3().fromBufferAttribute(position, i));
}

export function hasOnlyFiniteValues(geometry: BufferGeometry): boolean {
  return Object.values(geometry.attributes).every((attribute) => Array.from(attribute.array).every(Number.isFinite));
}

export function sumArea(triangles: Triangle[]): number {
  return triangles.reduce((total, triangle) => total + triangle.area, 0);
}

export function boundsOf(geometry: BufferGeometry): { min: Vector3; max: Vector3; size: Vector3; center: Vector3 } {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  return { min: box.min.clone(), max: box.max.clone(), size: box.getSize(new Vector3()), center: box.getCenter(new Vector3()) };
}
