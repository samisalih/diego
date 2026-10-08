import { DEGREES_TO_RADIANS, type Asset, type Item, type Material } from "@app/core";
import { memo, useEffect, useMemo, useRef } from "react";
import type { Mesh, Object3D } from "three";
import { buildItemParts, type ItemPart } from "./build/items.ts";
import { buildPartGeometry } from "./build/parts.ts";
import { GeometryCache } from "./geometryCache.ts";
import { useOutlineTargets } from "./outlineTargets.ts";
import { SurfaceMaterial } from "./Surfaces.tsx";
import type { ItemPointerHandlers } from "./useItemInteraction.ts";
import { useDeepStable } from "./useDeepStable.ts";

type ItemMeshesProps = {
  item: Item;
  parts: ItemPart[];
  materials: ReadonlyMap<string, Material>;
  cache: GeometryCache;
  handlers: ItemPointerHandlers | null;
  registerGroup: (itemId: string, group: Object3D | null) => void;
};

const ItemMeshes = memo(function ItemMeshes({ item, parts, materials, cache, handlers, registerGroup }: ItemMeshesProps) {
  return (
    <group
      ref={(group) => registerGroup(item.id, group)}
      position={[item.x, 0, item.z]}
      rotation={[0, item.rotation * DEGREES_TO_RADIANS, 0]}
      onPointerDown={handlers ? (event) => handlers.onPointerDown(item, event) : undefined}
      onPointerOver={handlers ? (event) => { event.stopPropagation(); handlers.onPointerOver(item); } : undefined}
      onPointerOut={handlers ? handlers.onPointerOut : undefined}
    >
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
});

type PartsEntry = { key: string; asset: Asset | undefined; parts: ItemPart[]; serial: number };

function partsKey(item: Item): string {
  return `${item.assetId}|${item.hidden}|${JSON.stringify(item.params)}`;
}

function meshesOf(groups: Map<string, Object3D>, ids: readonly string[]): Mesh[] {
  const meshes: Mesh[] = [];
  for (const id of ids) groups.get(id)?.traverse((object) => (object as Mesh).isMesh && meshes.push(object as Mesh));
  return meshes;
}

type ItemsMeshesProps = {
  items: Item[];
  assets: ReadonlyMap<string, Asset>;
  materials: ReadonlyMap<string, Material>;
  /** Items to draw the blue (selected) and red (flagged) outline around. */
  selectedIds?: readonly string[];
  flaggedIds?: readonly string[];
  handlers?: ItemPointerHandlers;
};

const NO_IDS: readonly string[] = [];

/**
 * All furniture; equal parts share one cached geometry, unused geometries are disposed after every commit.
 * The parts of an item are only rebuilt when its asset or params change, so moving an item stays cheap.
 */
export function ItemsMeshes({ items: itemsInput, assets, materials, selectedIds = NO_IDS, flaggedIds = NO_IDS, handlers }: ItemsMeshesProps) {
  const items = useDeepStable(itemsInput);
  const cache = useMemo(() => new GeometryCache(), []);
  const partsById = useRef(new Map<string, PartsEntry>());
  const nextSerial = useRef(0);
  const groups = useRef(new Map<string, Object3D>());
  const setTargets = useOutlineTargets((state) => state.setTargets);

  const itemsWithParts = useMemo(() => {
    const previous = partsById.current;
    const next = new Map<string, PartsEntry>();
    const result = items.map((item) => {
      const asset = assets.get(item.assetId);
      const key = partsKey(item);
      const known = previous.get(item.id);
      const entry = known && known.key === key && known.asset === asset ? known : { key, asset, parts: buildItemParts(item, asset), serial: nextSerial.current++ };
      next.set(item.id, entry);
      return { item, parts: entry.parts, serial: entry.serial };
    });
    partsById.current = next;
    return result;
  }, [items, assets]);

  const registerGroup = useMemo(
    () => (itemId: string, group: Object3D | null) => {
      if (group) groups.current.set(itemId, group);
      else groups.current.delete(itemId);
    },
    [],
  );

  useEffect(() => {
    const keysInUse = new Set(itemsWithParts.flatMap(({ parts }) => parts.map((part) => part.geometryKey)));
    cache.retainOnly(keysInUse);
  });
  useEffect(() => () => cache.disposeAll(), [cache]);

  // A new serial exactly when an item's meshes were rebuilt.
  const partsSignature = itemsWithParts.map(({ serial }) => serial).join(",");
  useEffect(() => {
    setTargets(meshesOf(groups.current, selectedIds), meshesOf(groups.current, flaggedIds));
  }, [selectedIds, flaggedIds, setTargets, partsSignature]);
  useEffect(() => () => setTargets([], []), [setTargets]);

  return (
    <group>
      {itemsWithParts.map(({ item, parts }) => (
        <ItemMeshes key={item.id} item={item} parts={parts} materials={materials} cache={cache} handlers={handlers ?? null} registerGroup={registerGroup} />
      ))}
    </group>
  );
}
