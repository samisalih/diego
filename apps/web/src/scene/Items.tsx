import { DEGREES_TO_RADIANS, type Asset, type Item, type Material } from "@app/core";
import { useEffect, useMemo } from "react";
import { buildItemParts } from "./build/items.ts";
import { buildPartGeometry } from "./build/parts.ts";
import { GeometryCache } from "./geometryCache.ts";
import { SurfaceMaterial } from "./Surfaces.tsx";
import { useDeepStable } from "./useDeepStable.ts";

type ItemProps = { item: Item; asset: Asset | undefined; materials: ReadonlyMap<string, Material>; cache: GeometryCache };

function ItemMeshes({ item: itemInput, asset: assetInput, materials, cache }: ItemProps) {
  const item = useDeepStable(itemInput);
  const asset = useDeepStable(assetInput);
  const parts = useMemo(() => buildItemParts(item, asset), [item, asset]);

  return (
    <group position={[item.x, 0, item.z]} rotation={[0, item.rotation * DEGREES_TO_RADIANS, 0]}>
      {parts.map((part) => (
        <mesh
          key={part.partId}
          geometry={cache.get(part.geometryKey, () => buildPartGeometry(part.resolved))}
          position={part.position}
          rotation={part.rotation}
          castShadow
          receiveShadow
        >
          <SurfaceMaterial material={part.materialId ? materials.get(part.materialId) : undefined} />
        </mesh>
      ))}
    </group>
  );
}

/** All furniture; equal parts share one cached geometry, unused geometries are disposed after every commit. */
export function ItemsMeshes({ items, assets, materials }: { items: Item[]; assets: ReadonlyMap<string, Asset>; materials: ReadonlyMap<string, Material> }) {
  const cache = useMemo(() => new GeometryCache(), []);

  const keysInUse = useMemo(() => {
    const keys = new Set<string>();
    for (const item of items) for (const part of buildItemParts(item, assets.get(item.assetId))) keys.add(part.geometryKey);
    return keys;
  }, [items, assets]);

  useEffect(() => cache.retainOnly(keysInUse));
  useEffect(() => () => cache.disposeAll(), [cache]);

  return (
    <group>
      {items.map((item) => (
        <ItemMeshes key={item.id} item={item} asset={assets.get(item.assetId)} materials={materials} cache={cache} />
      ))}
    </group>
  );
}
