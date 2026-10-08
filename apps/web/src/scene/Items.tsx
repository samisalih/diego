import { DEGREES_TO_RADIANS, type Asset, type Item, type Material } from "@app/core";
import { useEffect, useMemo } from "react";
import { buildItemParts, type ItemPart } from "./build/items.ts";
import { buildPartGeometry } from "./build/parts.ts";
import { GeometryCache } from "./geometryCache.ts";
import { SurfaceMaterial } from "./Surfaces.tsx";
import { useDeepStable } from "./useDeepStable.ts";

type ItemMeshesProps = { item: Item; parts: ItemPart[]; materials: ReadonlyMap<string, Material>; cache: GeometryCache };

function ItemMeshes({ item, parts, materials, cache }: ItemMeshesProps) {
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
export function ItemsMeshes({ items: itemsInput, assets, materials }: { items: Item[]; assets: ReadonlyMap<string, Asset>; materials: ReadonlyMap<string, Material> }) {
  const items = useDeepStable(itemsInput);
  const assetEntries = useDeepStable([...assets.entries()]);
  const cache = useMemo(() => new GeometryCache(), []);

  const itemsWithParts = useMemo(() => {
    const assetsById = new Map(assetEntries);
    return items.map((item) => ({ item, parts: buildItemParts(item, assetsById.get(item.assetId)) }));
  }, [items, assetEntries]);

  useEffect(() => {
    const keysInUse = new Set(itemsWithParts.flatMap(({ parts }) => parts.map((part) => part.geometryKey)));
    cache.retainOnly(keysInUse);
  });
  useEffect(() => () => cache.disposeAll(), [cache]);

  return (
    <group>
      {itemsWithParts.map(({ item, parts }) => (
        <ItemMeshes key={item.id} item={item} parts={parts} materials={materials} cache={cache} />
      ))}
    </group>
  );
}
