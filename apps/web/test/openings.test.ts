import { type Opening, type Wall } from "@app/core";
import { SEED_DOCUMENT } from "../../../packages/core/src/seed/index.ts";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { buildOpeningFixtures } from "../src/scene/build/openings.ts";

type Fixture = ReturnType<typeof buildOpeningFixtures>[number];

const { walls, openings } = SEED_DOCUMENT.apartment;
const wallById = (id: string): Wall => walls.find((wall) => wall.id === id)!;
const openingById = (id: string): Opening => openings.find((opening) => opening.id === id)!;

const FRAME_BAR = 0.06;
const FRAME_DEPTH = 0.07;
const GLASS_THICKNESS = 0.01;
const EPS = 1e-6;

function worldBox(fixture: Fixture): Box3 {
  const [w, h, d] = fixture.size;
  const matrix = new Matrix4().compose(
    new Vector3(...fixture.position),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), fixture.rotationY),
    new Vector3(1, 1, 1),
  );
  return new Box3(new Vector3(-w / 2, -h / 2, -d / 2), new Vector3(w / 2, h / 2, d / 2)).applyMatrix4(matrix);
}

const union = (fixtures: Fixture[]) => fixtures.reduce((box, fixture) => box.union(worldBox(fixture)), new Box3());
const frames = (fixtures: Fixture[]) => fixtures.filter((fixture) => fixture.kind === "frame");
const glass = (fixtures: Fixture[]) => fixtures.filter((fixture) => fixture.kind === "glass");

/** World-space rectangle of the hole: along-wall range, vertical range and the wall's centre line point. */
function holeBox(wall: Wall, opening: Opening): Box3 {
  const length = Math.hypot(wall.endX - wall.startX, wall.endZ - wall.startZ);
  const dirX = (wall.endX - wall.startX) / length;
  const dirZ = (wall.endZ - wall.startZ) / length;
  const at = (offset: number, y: number) => new Vector3(wall.startX + dirX * offset, y, wall.startZ + dirZ * offset);
  return new Box3().setFromPoints([
    at(opening.offsetFromStart, opening.sillHeight),
    at(opening.offsetFromStart + opening.width, opening.sillHeight + opening.height),
  ]);
}

function expectBoxClose(actual: Box3, expected: Box3, tolerance = 1e-5) {
  for (const key of ["x", "y", "z"] as const) {
    expect(actual.min[key], `min.${key}`).toBeCloseTo(expected.min[key], -Math.log10(tolerance));
    expect(actual.max[key], `max.${key}`).toBeCloseTo(expected.max[key], -Math.log10(tolerance));
  }
}

describe("buildOpeningFixtures", () => {
  describe("window (north wall, along +x)", () => {
    const wall = wallById("wall_north");
    const opening = openingById("opening_kitchen_window_north");
    const fixtures = buildOpeningFixtures(wall, opening);

    // Red if the frame has a different bar count (e.g. 3 or 5 bars).
    it("has four frame bars and one glass pane", () => {
      expect(frames(fixtures)).toHaveLength(4);
      expect(glass(fixtures)).toHaveLength(1);
    });

    // Red if the bar width/depth deviates from 0.06 m / 0.07 m.
    it("uses 0.06 m wide and 0.07 m deep frame bars", () => {
      for (const bar of frames(fixtures)) {
        expect(bar.size[2]).toBeCloseTo(FRAME_DEPTH, 6);
        expect(Math.min(bar.size[0], bar.size[1])).toBeCloseTo(FRAME_BAR, 6);
      }
    });

    // Red if the frame is offset from the hole or sticks out of it.
    it("makes the frame bars span exactly the hole rectangle, centred in the wall thickness", () => {
      const expected = holeBox(wall, opening);
      const box = union(frames(fixtures));
      expect(box.min.x).toBeCloseTo(expected.min.x, 5);
      expect(box.max.x).toBeCloseTo(expected.max.x, 5);
      expect(box.min.y).toBeCloseTo(expected.min.y, 5);
      expect(box.max.y).toBeCloseTo(expected.max.y, 5);
      expect((box.min.z + box.max.z) / 2).toBeCloseTo(wall.startZ, 5);
      expect(box.max.z - box.min.z).toBeCloseTo(FRAME_DEPTH, 5);
    });

    // Red if the bars overlap the glass area, i.e. if the bar union is not a ring around the inner area.
    it("fits the glass pane inside the frame, 0.01 m thick, centred in the wall", () => {
      const hole = holeBox(wall, opening);
      const pane = worldBox(glass(fixtures)[0]!);
      expect(pane.min.x).toBeCloseTo(hole.min.x + FRAME_BAR, 5);
      expect(pane.max.x).toBeCloseTo(hole.max.x - FRAME_BAR, 5);
      expect(pane.min.y).toBeCloseTo(hole.min.y + FRAME_BAR, 5);
      expect(pane.max.y).toBeCloseTo(hole.max.y - FRAME_BAR, 5);
      expect(pane.max.z - pane.min.z).toBeCloseTo(GLASS_THICKNESS, 6);
      expect((pane.min.z + pane.max.z) / 2).toBeCloseTo(wall.startZ, 5);
    });

    // Red if the pane is not a single local-space box with the thickness on the depth axis.
    it("reports the glass thickness as the depth component", () => {
      expect(glass(fixtures)[0]!.size[2]).toBeCloseTo(GLASS_THICKNESS, 6);
    });
  });

  describe("window in a wall running along z (east wall)", () => {
    const wall = wallById("wall_east");
    const opening = openingById("opening_kitchen_window_east");
    const fixtures = buildOpeningFixtures(wall, opening);

    // Red if rotationY ignores the wall direction (frame would lie along the wrong axis).
    it("rotates the fixtures with the wall direction", () => {
      const expected = holeBox(wall, opening);
      const box = union(frames(fixtures));
      expect(box.min.z).toBeCloseTo(expected.min.z, 5);
      expect(box.max.z).toBeCloseTo(expected.max.z, 5);
      expect(box.min.y).toBeCloseTo(expected.min.y, 5);
      expect(box.max.y).toBeCloseTo(expected.max.y, 5);
      expect(box.max.x - box.min.x).toBeCloseTo(FRAME_DEPTH, 5);
      expect((box.min.x + box.max.x) / 2).toBeCloseTo(wall.startX, 5);
    });

    // Red if the glass is rotated differently than the frame.
    it("rotates the glass like the frame", () => {
      const hole = holeBox(wall, opening);
      const pane = worldBox(glass(fixtures)[0]!);
      expect(pane.min.z).toBeCloseTo(hole.min.z + FRAME_BAR, 5);
      expect(pane.max.z).toBeCloseTo(hole.max.z - FRAME_BAR, 5);
      expect(pane.max.x - pane.min.x).toBeCloseTo(GLASS_THICKNESS, 6);
    });
  });

  describe("balcony door", () => {
    const wall = wallById("wall_south");
    const opening = openingById("opening_balcony_door");
    const fixtures = buildOpeningFixtures(wall, opening);

    // Red if a balcony door is built like a door (no glass) or without a full frame.
    it("is built like a window over the full opening height", () => {
      expect(frames(fixtures)).toHaveLength(4);
      expect(glass(fixtures)).toHaveLength(1);
      const expected = holeBox(wall, opening);
      const box = union(frames(fixtures));
      expect(box.min.x).toBeCloseTo(expected.min.x, 5);
      expect(box.max.x).toBeCloseTo(expected.max.x, 5);
      expect(box.min.y).toBeCloseTo(opening.sillHeight, 5);
      expect(box.max.y).toBeCloseTo(opening.sillHeight + opening.height, 5);
    });
  });

  describe("door", () => {
    const wall = wallById("wall_north");
    const opening = openingById("opening_front_door");
    const fixtures = buildOpeningFixtures(wall, opening);

    // Red if a door gets a bottom bar or glass.
    it("has three frame bars (two sides and the top) and no glass", () => {
      expect(frames(fixtures)).toHaveLength(3);
      expect(glass(fixtures)).toHaveLength(0);
    });

    // Red if the door frame misses the hole or has a bar at the floor.
    it("spans the hole and keeps the bottom open", () => {
      const expected = holeBox(wall, opening);
      const box = union(frames(fixtures));
      expectBoxClose(new Box3(new Vector3(box.min.x, box.min.y, 0), new Vector3(box.max.x, box.max.y, 0)), new Box3(new Vector3(expected.min.x, expected.min.y, 0), new Vector3(expected.max.x, expected.max.y, 0)));
      const bottomBars = frames(fixtures).filter((bar) => worldBox(bar).max.y < opening.sillHeight + opening.height / 2 && bar.size[0] > bar.size[1]);
      expect(bottomBars).toHaveLength(0);
    });

    // Red if bars have a different cross-section than windows.
    it("uses the same bar width and depth as windows", () => {
      for (const bar of frames(fixtures)) {
        expect(bar.size[2]).toBeCloseTo(FRAME_DEPTH, 6);
        expect(Math.min(bar.size[0], bar.size[1])).toBeCloseTo(FRAME_BAR, 6);
      }
    });
  });

  // Red if fixtures exceed the hole (EPS: numeric noise only).
  it("keeps every fixture of every seed opening inside its hole", () => {
    for (const opening of openings) {
      const wall = wallById(opening.wallId);
      const hole = holeBox(wall, opening);
      const box = union(buildOpeningFixtures(wall, opening));
      expect(box.min.y, opening.id).toBeGreaterThan(hole.min.y - EPS);
      expect(box.max.y, opening.id).toBeLessThan(hole.max.y + EPS);
    }
  });
});
