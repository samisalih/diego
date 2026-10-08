import { wallLength, type Opening, type Room, type Vec2, type Wall } from "@app/core";

const PARALLEL_TOLERANCE = 0.02;
const WALL_FACE_TOLERANCE_M = 0.06;
const MIN_SHARED_LENGTH_M = 0.05;

function sub(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

function lineOverlap(edgeStart: Vec2, edgeEnd: Vec2, wall: Wall): { distance: number; shared: number } | null {
  const edge = sub(edgeEnd, edgeStart);
  const edgeLength = Math.hypot(edge[0], edge[1]);
  if (edgeLength === 0) return null;
  const direction: Vec2 = [edge[0] / edgeLength, edge[1] / edgeLength];
  const wallDirection: Vec2 = [(wall.endX - wall.startX) / wallLength(wall), (wall.endZ - wall.startZ) / wallLength(wall)];
  if (Math.abs(direction[0] * wallDirection[1] - direction[1] * wallDirection[0]) > PARALLEL_TOLERANCE) return null;
  const offset = sub([wall.startX, wall.startZ], edgeStart);
  const distance = Math.abs(offset[0] * direction[1] - offset[1] * direction[0]);
  const along = [offset[0] * direction[0] + offset[1] * direction[1], (wall.endX - edgeStart[0]) * direction[0] + (wall.endZ - edgeStart[1]) * direction[1]].sort((a, b) => a - b);
  const shared = Math.min(edgeLength, along[1]!) - Math.max(0, along[0]!);
  return { distance, shared };
}

/** The walls that run along an edge of the room polygon (the polygon is inset by half the wall thickness). */
export function wallsOfRoom(room: Room, walls: Wall[]): Wall[] {
  return walls.filter((wall) =>
    room.polygon.some((start, index) => {
      const overlap = lineOverlap(start, room.polygon[(index + 1) % room.polygon.length]!, wall);
      return overlap !== null && overlap.distance <= wall.thickness / 2 + WALL_FACE_TOLERANCE_M && overlap.shared > MIN_SHARED_LENGTH_M;
    }),
  );
}

export function openingsOfWall(wall: Wall, openings: Opening[]): Opening[] {
  return openings.filter((opening) => opening.wallId === wall.id);
}
