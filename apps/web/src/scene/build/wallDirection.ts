import { wallLength, type WallEnds } from "@app/core";

/** Unit direction of a wall from its start to its end in plan (x, z). */
export function wallDirection(wall: WallEnds): [dirX: number, dirZ: number] {
  const length = wallLength(wall);
  return [(wall.endX - wall.startX) / length, (wall.endZ - wall.startZ) / length];
}
