import { PerspectiveCamera, Vector3 } from "three";
import type { Bounds, CameraSetup } from "./framing.ts";

const FILL_SHARE = 0.9;
const FIT_ITERATIONS = 3;
const NEAR_M = 0.1;
const FAR_M = 1500;

function boundsCorners({ min, max }: Bounds): Vector3[] {
  return [min[0], max[0]].flatMap((x) => [min[1], max[1]].flatMap((y) => [min[2], max[2]].map((z) => new Vector3(x, y, z))));
}

/** Pixel extent (width, height) of the bounds as seen from the camera. */
function projectedSize(camera: PerspectiveCamera, corners: Vector3[], viewport: { width: number; height: number }): { width: number; height: number } {
  const ndc = corners.map((corner) => corner.clone().project(camera));
  const xs = ndc.map((point) => point.x);
  const ys = ndc.map((point) => point.y);
  return {
    width: ((Math.max(...xs) - Math.min(...xs)) / 2) * viewport.width,
    height: ((Math.max(...ys) - Math.min(...ys)) / 2) * viewport.height,
  };
}

/**
 * Backs the camera off along its line of sight until the bounds fit into the part of the viewport the panels
 * leave free (`free` in pixels). The image is centred in that area separately, by the camera's view offset.
 */
export function fitCameraToFreeArea(setup: CameraSetup, bounds: Bounds, viewport: { width: number; height: number }, free: { width: number; height: number }): CameraSetup {
  const camera = new PerspectiveCamera(setup.fov, viewport.width / viewport.height, NEAR_M, FAR_M);
  const target = new Vector3(...setup.target);
  const offset = new Vector3(...setup.position).sub(target);
  const corners = boundsCorners(bounds);
  let scale = 1;
  for (let iteration = 0; iteration < FIT_ITERATIONS; iteration += 1) {
    camera.position.copy(target).addScaledVector(offset, scale);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const size = projectedSize(camera, corners, viewport);
    scale *= Math.max(size.width / (free.width * FILL_SHARE), size.height / (free.height * FILL_SHARE));
  }
  const position = target.clone().addScaledVector(offset, scale);
  return { ...setup, position: [position.x, position.y, position.z] };
}
