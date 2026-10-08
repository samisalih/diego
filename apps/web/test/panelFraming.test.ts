import { SEED_DOCUMENT } from "../../../packages/core/src/seed/index.ts";
import type { Apartment } from "@app/core";
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { insetsFor } from "../src/editor/layoutMetrics.ts";
import { apartmentBounds, dollhouseCamera, type Bounds, type CameraSetup } from "../src/scene/build/framing.ts";
import { fitCameraToFreeArea } from "../src/scene/build/panelFraming.ts";

// Contract: docs/specs/editor.md section 4 (the camera framing accounts for the panels: the apartment is framed in the free
// area between them). Interpretations made by the tests:
// - fitCameraToFreeArea(setup, bounds, viewport, free) only backs the camera off along its line of sight (same target, fov
//   and direction); the projected bounds then fit into `free` (pixels) with margin and use most of it; centring in the free
//   area is done separately by a view offset, so the bounds centre stays on the optical axis here

const seed = SEED_DOCUMENT.apartment;
const VIEWPORT = { width: 1440, height: 900 };

function projectedExtent(setup: CameraSetup, bounds: Bounds, viewport: { width: number; height: number }) {
  const camera = new PerspectiveCamera(setup.fov, viewport.width / viewport.height, 0.1, 1500);
  camera.position.set(...setup.position);
  camera.lookAt(new Vector3(...setup.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const points = [bounds.min[0], bounds.max[0]].flatMap((x) =>
    [bounds.min[1], bounds.max[1]].flatMap((y) => [bounds.min[2], bounds.max[2]].map((z) => new Vector3(x, y, z).project(camera))),
  );
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const centre = new Vector3(...bounds.center).project(camera);
  return {
    width: ((Math.max(...xs) - Math.min(...xs)) / 2) * viewport.width,
    height: ((Math.max(...ys) - Math.min(...ys)) / 2) * viewport.height,
    centre,
  };
}

const distanceOf = (setup: CameraSetup): number => new Vector3(...setup.position).distanceTo(new Vector3(...setup.target));
const freeAreaFor = (state: { isLeftOpen: boolean; isRightOpen: boolean }) => {
  const insets = insetsFor(state);
  return { width: VIEWPORT.width - insets.left - insets.right, height: VIEWPORT.height - insets.top };
};

describe("fitCameraToFreeArea", () => {
  const bounds = apartmentBounds(seed);
  const start = dollhouseCamera(bounds);
  const free = freeAreaFor({ isLeftOpen: true, isRightOpen: true });

  // Red if the bounds overflow the free area (they would hide behind a panel).
  it("fits the projected bounds into the free area", () => {
    const fitted = fitCameraToFreeArea(start, bounds, VIEWPORT, free);
    const extent = projectedExtent(fitted, bounds, VIEWPORT);
    expect(extent.width).toBeLessThanOrEqual(free.width);
    expect(extent.height).toBeLessThanOrEqual(free.height);
  });

  // Red if no margin is left: the bounds must stay clearly inside the free area, not touch its edge.
  it("leaves a margin around the apartment", () => {
    const extent = projectedExtent(fitCameraToFreeArea(start, bounds, VIEWPORT, free), bounds, VIEWPORT);
    expect(Math.max(extent.width / free.width, extent.height / free.height)).toBeLessThan(0.99);
  });

  // Red if the camera backs off far too much (the apartment would be tiny): the limiting side uses most of the free area.
  it("uses most of the free area along the limiting side", () => {
    const extent = projectedExtent(fitCameraToFreeArea(start, bounds, VIEWPORT, free), bounds, VIEWPORT);
    expect(Math.max(extent.width / free.width, extent.height / free.height)).toBeGreaterThan(0.8);
  });

  // Red if the target, fov or viewing direction change (that would move the apartment off the centre of the free area).
  it("keeps target and fov and only moves along the line of sight", () => {
    const fitted = fitCameraToFreeArea(start, bounds, VIEWPORT, free);
    expect(fitted.target).toEqual(start.target);
    expect(fitted.fov).toBe(start.fov);
    const before = new Vector3(...start.position).sub(new Vector3(...start.target)).normalize();
    const after = new Vector3(...fitted.position).sub(new Vector3(...fitted.target)).normalize();
    expect(after.distanceTo(before)).toBeLessThan(1e-9);
  });

  // Red if the bounds centre leaves the optical axis (it would not be centred in the free area).
  it("keeps the apartment centred on the optical axis", () => {
    const { centre } = projectedExtent(fitCameraToFreeArea(start, bounds, VIEWPORT, free), bounds, VIEWPORT);
    expect(Math.abs(centre.x)).toBeLessThan(1e-6);
    expect(Math.abs(centre.y)).toBeLessThan(1e-6);
  });

  // Red if wider panels (a smaller free area) bring the camera closer.
  it("does not move closer when the free area shrinks", () => {
    const wide = distanceOf(fitCameraToFreeArea(start, bounds, VIEWPORT, { width: 1000, height: 700 }));
    const narrow = distanceOf(fitCameraToFreeArea(start, bounds, VIEWPORT, { width: 500, height: 700 }));
    const lower = distanceOf(fitCameraToFreeArea(start, bounds, VIEWPORT, { width: 500, height: 350 }));
    expect(narrow).toBeGreaterThanOrEqual(wide);
    expect(lower).toBeGreaterThanOrEqual(narrow);
  });

  // Red if collapsed panels (more free width) do not let the camera come closer than expanded ones.
  it("frames closer with collapsed panels than with expanded ones", () => {
    const expanded = distanceOf(fitCameraToFreeArea(start, bounds, VIEWPORT, freeAreaFor({ isLeftOpen: true, isRightOpen: true })));
    const collapsed = distanceOf(fitCameraToFreeArea(start, bounds, VIEWPORT, freeAreaFor({ isLeftOpen: false, isRightOpen: false })));
    expect(collapsed).toBeLessThanOrEqual(expanded);
  });

  // Red if the empty-apartment stand-in bounds produce NaN / Infinity (no walls and rooms yet).
  it("returns a finite camera for the empty-apartment fallback bounds", () => {
    const empty: Apartment = { meta: seed.meta, rooms: [], walls: [], openings: [] };
    const emptyBounds = apartmentBounds(empty);
    const fitted = fitCameraToFreeArea(dollhouseCamera(emptyBounds), emptyBounds, VIEWPORT, free);
    expect(fitted.position.every(Number.isFinite)).toBe(true);
    const extent = projectedExtent(fitted, emptyBounds, VIEWPORT);
    expect(extent.width).toBeLessThanOrEqual(free.width);
    expect(extent.height).toBeLessThanOrEqual(free.height);
  });
});
