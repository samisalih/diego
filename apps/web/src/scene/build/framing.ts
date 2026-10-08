import type { Apartment, Vec3 } from "@app/core";

export type Bounds = { min: Vec3; max: Vec3; center: Vec3; radius: number };
export type CameraSetup = { position: Vec3; target: Vec3; fov: number };

const DOLLHOUSE_FOV_DEG = 35;
const DOLLHOUSE_ELEVATION_RAD = Math.PI / 4;
const FIT_MARGIN = 1.1;

function wallCorners(wall: Apartment["walls"][number]): Array<[number, number]> {
  const length = Math.hypot(wall.endX - wall.startX, wall.endZ - wall.startZ);
  const halfX = (-(wall.endZ - wall.startZ) / length) * (wall.thickness / 2);
  const halfZ = ((wall.endX - wall.startX) / length) * (wall.thickness / 2);
  return [
    [wall.startX + halfX, wall.startZ + halfZ],
    [wall.startX - halfX, wall.startZ - halfZ],
    [wall.endX + halfX, wall.endZ + halfZ],
    [wall.endX - halfX, wall.endZ - halfZ],
  ];
}

/** Axis-aligned bounds over all walls (including thickness) and rooms, floor to ceiling. */
export function apartmentBounds(apartment: Apartment): Bounds {
  const points = [...apartment.walls.flatMap(wallCorners), ...apartment.rooms.flatMap((room) => room.polygon)];
  const xs = points.map(([x]) => x);
  const zs = points.map(([, z]) => z);
  const min: Vec3 = [Math.min(...xs), 0, Math.min(...zs)];
  const max: Vec3 = [Math.max(...xs), apartment.meta.ceilingHeight, Math.max(...zs)];
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  return { min, max, center, radius };
}

/** Camera looking at the bounds' centre from the south-east at 45 degrees, far enough to fit them with 10 % margin. */
export function dollhouseCamera(bounds: Bounds): CameraSetup {
  const distance = (bounds.radius * FIT_MARGIN) / Math.sin((DOLLHOUSE_FOV_DEG * Math.PI) / 360);
  const horizontal = (distance * Math.cos(DOLLHOUSE_ELEVATION_RAD)) / Math.SQRT2;
  const [x, y, z] = bounds.center;
  return {
    position: [x + horizontal, y + distance * Math.sin(DOLLHOUSE_ELEVATION_RAD), z + horizontal],
    target: bounds.center,
    fov: DOLLHOUSE_FOV_DEG,
  };
}
