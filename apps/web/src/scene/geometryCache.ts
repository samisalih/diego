import type { BufferGeometry } from "three";

/** Shares one BufferGeometry between all parts with the same geometry key and disposes unused ones. */
export class GeometryCache {
  private readonly geometries = new Map<string, BufferGeometry>();

  get(key: string, build: () => BufferGeometry): BufferGeometry {
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = build();
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  /** Disposes every cached geometry whose key is not in `keysInUse`. */
  retainOnly(keysInUse: ReadonlySet<string>): void {
    for (const [key, geometry] of this.geometries) {
      if (keysInUse.has(key)) continue;
      geometry.dispose();
      this.geometries.delete(key);
    }
  }

  disposeAll(): void {
    this.retainOnly(new Set());
  }
}
