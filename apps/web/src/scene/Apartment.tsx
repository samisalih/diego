import type { Apartment as ApartmentData, Material, Opening, Room, Wall } from "@app/core";
import { DoubleSide, type BufferGeometry } from "three";
import { useEffect, useMemo } from "react";
import { buildCeilingGeometry, buildFloorGeometry } from "./build/rooms.ts";
import { buildOpeningFixtures } from "./build/openings.ts";
import { buildWallGeometry } from "./build/walls.ts";
import { findWallMaterialId } from "./build/wallMaterial.ts";
import { GlassMaterial, SurfaceMaterial } from "./Surfaces.tsx";

type MaterialsById = ReadonlyMap<string, Material>;

function useDisposed(geometry: BufferGeometry): BufferGeometry {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function lookup(materials: MaterialsById, id: string | null | undefined): Material | undefined {
  return id ? materials.get(id) : undefined;
}

function WallMesh({ wall, walls, openings, ceilingHeight, material }: { wall: Wall; walls: Wall[]; openings: Opening[]; ceilingHeight: number; material: Material | undefined }) {
  const geometry = useDisposed(useMemo(() => buildWallGeometry(wall, walls, openings, ceilingHeight), [wall, walls, openings, ceilingHeight]));
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <SurfaceMaterial material={material} />
    </mesh>
  );
}

function OpeningFixtures({ wall, opening, frameMaterial }: { wall: Wall; opening: Opening; frameMaterial: Material | undefined }) {
  const fixtures = useMemo(() => buildOpeningFixtures(wall, opening), [wall, opening]);
  return fixtures.map((fixture, index) => (
    <mesh key={index} position={fixture.position} rotation={[0, fixture.rotationY, 0]} castShadow={fixture.kind === "frame"} receiveShadow={fixture.kind === "frame"}>
      <boxGeometry args={fixture.size} />
      {fixture.kind === "glass" ? <GlassMaterial /> : <SurfaceMaterial material={frameMaterial} />}
    </mesh>
  ));
}

function FloorMesh({ room, material }: { room: Room; material: Material | undefined }) {
  const geometry = useDisposed(useMemo(() => buildFloorGeometry(room), [room]));
  return (
    <mesh geometry={geometry} receiveShadow>
      <SurfaceMaterial material={material} />
    </mesh>
  );
}

/** Invisible to the camera (no colour, no depth) but still blocks the sun, so light only enters through the windows. */
function CeilingShadowCaster({ room, ceilingHeight }: { room: Room; ceilingHeight: number }) {
  const geometry = useDisposed(useMemo(() => buildCeilingGeometry(room, ceilingHeight), [room, ceilingHeight]));
  return (
    <mesh geometry={geometry} castShadow>
      <meshBasicMaterial colorWrite={false} depthWrite={false} side={DoubleSide} shadowSide={DoubleSide} />
    </mesh>
  );
}

const NO_OPENINGS: Opening[] = [];

function groupByWallId(openings: Opening[]): Map<string, Opening[]> {
  const grouped = new Map<string, Opening[]>();
  for (const opening of openings) grouped.set(opening.wallId, [...(grouped.get(opening.wallId) ?? []), opening]);
  return grouped;
}

/** Walls with openings, floors, ceiling shadow casters and opening fixtures; `apartment` must be reference-stable while its content is unchanged. */
export function ApartmentMeshes({ apartment, materials }: { apartment: ApartmentData; materials: MaterialsById }) {
  const { walls, rooms, openings, meta } = apartment;
  const wallsById = useMemo(() => new Map(walls.map((wall) => [wall.id, wall])), [walls]);
  const openingsByWallId = useMemo(() => groupByWallId(openings), [openings]);

  return (
    <group>
      {walls.map((wall) => (
        <WallMesh
          key={wall.id}
          wall={wall}
          walls={walls}
          openings={openingsByWallId.get(wall.id) ?? NO_OPENINGS}
          ceilingHeight={meta.ceilingHeight}
          material={lookup(materials, findWallMaterialId(wall, rooms))}
        />
      ))}
      {rooms.map((room) => (
        <FloorMesh key={room.id} room={room} material={lookup(materials, room.floorMaterialId)} />
      ))}
      {rooms.map((room) => (
        <CeilingShadowCaster key={room.id} room={room} ceilingHeight={meta.ceilingHeight} />
      ))}
      {openings.map((opening) => {
        const wall = wallsById.get(opening.wallId);
        return wall && <OpeningFixtures key={opening.id} wall={wall} opening={opening} frameMaterial={lookup(materials, opening.frameMaterialId)} />;
      })}
    </group>
  );
}
