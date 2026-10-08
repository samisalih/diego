import type { Opening, Vec3, Wall } from "@app/core";
import { wallDirection } from "./wallDirection.ts";

/** A box to render inside a wall hole, in world space; `size` is [along the wall, height, depth]. */
export type OpeningFixture = {
  kind: "frame" | "glass";
  position: Vec3;
  rotationY: number;
  size: Vec3;
};

const FRAME_BAR_WIDTH = 0.06;
const FRAME_DEPTH = 0.07;
const GLASS_THICKNESS = 0.01;

/** Creates fixtures from boxes given in the hole's own frame: u along the wall from its start, v up. */
function createFixtureFactory(wall: Wall) {
  const [dirX, dirZ] = wallDirection(wall);
  // three.js y-rotation maps local +x to (cos, 0, -sin), so the wall direction needs the negated angle.
  const rotationY = Math.atan2(-dirZ, dirX);
  return (kind: OpeningFixture["kind"], centerU: number, centerV: number, width: number, height: number, depth: number): OpeningFixture => ({
    kind,
    position: [wall.startX + dirX * centerU, centerV, wall.startZ + dirZ * centerU],
    rotationY,
    size: [width, height, depth],
  });
}

/**
 * Frame bars (and glass for windows and balcony doors) filling an opening's hole.
 * Doors get three bars (two sides and the top) and no leaf.
 */
export function buildOpeningFixtures(wall: Wall, opening: Opening): OpeningFixture[] {
  const create = createFixtureFactory(wall);
  const { width, height } = opening;
  const centerU = opening.offsetFromStart + width / 2;
  const centerV = opening.sillHeight + height / 2;
  const innerWidth = width - 2 * FRAME_BAR_WIDTH;
  const sideOffset = (width - FRAME_BAR_WIDTH) / 2;
  const topV = opening.sillHeight + height - FRAME_BAR_WIDTH / 2;
  const bottomV = opening.sillHeight + FRAME_BAR_WIDTH / 2;

  const fixtures = [
    create("frame", centerU - sideOffset, centerV, FRAME_BAR_WIDTH, height, FRAME_DEPTH),
    create("frame", centerU + sideOffset, centerV, FRAME_BAR_WIDTH, height, FRAME_DEPTH),
    create("frame", centerU, topV, innerWidth, FRAME_BAR_WIDTH, FRAME_DEPTH),
  ];
  if (opening.type === "door") return fixtures;

  fixtures.push(
    create("frame", centerU, bottomV, innerWidth, FRAME_BAR_WIDTH, FRAME_DEPTH),
    create("glass", centerU, centerV, innerWidth, height - 2 * FRAME_BAR_WIDTH, GLASS_THICKNESS),
  );
  return fixtures;
}
