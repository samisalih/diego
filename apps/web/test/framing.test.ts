import { type Apartment } from "@app/core";
import { SEED_DOCUMENT } from "../../../packages/core/src/seed/index.ts";
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { apartmentBounds, dollhouseCamera } from "../src/scene/build/framing.ts";

const seed = SEED_DOCUMENT.apartment;
const CEILING = seed.meta.ceilingHeight;

const corners = (min: number[], max: number[]): Vector3[] =>
  [min[0], max[0]].flatMap((x) => [min[1], max[1]].flatMap((y) => [min[2], max[2]].map((z) => new Vector3(x, y, z))));

describe("apartmentBounds", () => {
  const bounds = apartmentBounds(seed);

  // Red if wall thickness is left out (the west wall centre line lies at x = 0.18, its outer face at x = 0).
  it("includes the wall thickness: the seed spans 0..9.36 x 0..7.36", () => {
    expect(bounds.min[0]).toBeCloseTo(0, 5);
    expect(bounds.max[0]).toBeCloseTo(9.36, 5);
    expect(bounds.min[2]).toBeCloseTo(0, 5);
    expect(bounds.max[2]).toBeCloseTo(7.36, 5);
  });

  // Red if the height is not 0..ceilingHeight.
  it("spans the floor to the ceiling vertically", () => {
    expect(bounds.min[1]).toBeCloseTo(0, 5);
    expect(bounds.max[1]).toBeCloseTo(CEILING, 5);
  });

  // Red if the centre is not the midpoint of min and max.
  it("has its centre in the middle of the box", () => {
    bounds.center.forEach((value, i) => expect(value).toBeCloseTo((bounds.min[i]! + bounds.max[i]!) / 2, 6));
  });

  // Red if the radius does not enclose the box or is far too large.
  it("has a radius that encloses all corners without being wasteful", () => {
    const halfDiagonal = new Vector3(...bounds.max).distanceTo(new Vector3(...bounds.min)) / 2;
    expect(bounds.radius).toBeGreaterThanOrEqual(halfDiagonal - 1e-6);
    expect(bounds.radius).toBeLessThanOrEqual(halfDiagonal * 1.5);
  });

  // Red if rooms are ignored: a room polygon beyond all walls must widen the bounds.
  it("includes rooms that extend beyond the walls", () => {
    const apartment: Apartment = {
      ...seed,
      rooms: [...seed.rooms, { ...seed.rooms[0]!, id: "room_far", polygon: [[-3, -2], [0, -2], [0, 0]] }],
    };
    const wide = apartmentBounds(apartment);
    expect(wide.min[0]).toBeCloseTo(-3, 5);
    expect(wide.min[2]).toBeCloseTo(-2, 5);
    expect(wide.max[0]).toBeCloseTo(bounds.max[0], 5);
  });

  // Red if walls are measured by their centre line only: thickness 1 adds 0.5 m on each side.
  it("adds half the thickness on both sides of a wall", () => {
    const apartment: Apartment = {
      ...seed,
      rooms: [],
      openings: [],
      walls: [{ id: "wall_single", startX: 0, startZ: 0, endX: 4, endZ: 0, thickness: 0.8, exterior: true }],
    };
    const single = apartmentBounds(apartment);
    expect(single.min[2]).toBeCloseTo(-0.4, 5);
    expect(single.max[2]).toBeCloseTo(0.4, 5);
    expect(single.min[0]).toBeCloseTo(0, 5);
    expect(single.max[0]).toBeCloseTo(4, 5);
  });
});

describe("dollhouseCamera", () => {
  const bounds = apartmentBounds(seed);
  const camera = dollhouseCamera(bounds);
  const target = new Vector3(...camera.target);
  const position = new Vector3(...camera.position);

  // Red if the camera looks anywhere but at the centre.
  it("looks at the centre of the bounds", () => {
    camera.target.forEach((value, i) => expect(value).toBeCloseTo(bounds.center[i]!, 5));
  });

  // Red if the camera sits north/west or below: south is +z, east is +x for northAngle 0 plans.
  it("sits south-east of and above the centre", () => {
    expect(position.x).toBeGreaterThan(target.x);
    expect(position.z).toBeGreaterThan(target.z);
    expect(position.y).toBeGreaterThan(target.y);
  });

  // Red if the elevation is far from ~45 degrees or the direction not diagonal.
  it("looks down at about 45 degrees", () => {
    const offset = position.clone().sub(target);
    const elevation = Math.atan2(offset.y, Math.hypot(offset.x, offset.z)) * (180 / Math.PI);
    expect(elevation).toBeGreaterThan(38);
    expect(elevation).toBeLessThan(52);
    expect(Math.abs(offset.x)).toBeCloseTo(Math.abs(offset.z), 3);
  });

  // Red if the field of view is not a sane perspective angle.
  it("has a vertical field of view between 10 and 90 degrees", () => {
    expect(camera.fov).toBeGreaterThan(10);
    expect(camera.fov).toBeLessThan(90);
  });

  // Red if the distance is too short: the bounding sphere plus 10 % margin must fit the field of view.
  it("fits the whole bounds with at least 10 % margin", () => {
    const distance = position.distanceTo(target);
    expect(distance * Math.sin((camera.fov * Math.PI) / 360)).toBeGreaterThanOrEqual(bounds.radius * 1.1 - 1e-6);
  });

  // Red if every corner does not project inside the view (square aspect: the strictest case for a vertical fov).
  it("projects every corner of the bounds inside the viewport", () => {
    const three = new PerspectiveCamera(camera.fov, 1, 0.1, 1000);
    three.position.copy(position);
    three.lookAt(target);
    three.updateMatrixWorld();
    three.updateProjectionMatrix();
    for (const corner of corners(bounds.min, bounds.max)) {
      const ndc = corner.clone().project(three);
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
    }
  });

  // Red if the camera is placed absurdly far away (the home must stay readable).
  it("does not stand more than twice as far as needed", () => {
    const needed = (bounds.radius * 1.1) / Math.sin((camera.fov * Math.PI) / 360);
    expect(position.distanceTo(target)).toBeLessThanOrEqual(needed * 2);
  });

  // Red if the distance does not scale with the apartment size.
  it("moves further away for a bigger apartment", () => {
    const big = dollhouseCamera({ min: [0, 0, 0], max: [40, 3, 30], center: [20, 1.5, 15], radius: Math.hypot(40, 3, 30) / 2 });
    const small = dollhouseCamera({ min: [0, 0, 0], max: [4, 3, 3], center: [2, 1.5, 1.5], radius: Math.hypot(4, 3, 3) / 2 });
    const distance = (c: typeof big) => new Vector3(...c.position).distanceTo(new Vector3(...c.target));
    expect(distance(big)).toBeGreaterThan(distance(small) * 3);
  });
});
