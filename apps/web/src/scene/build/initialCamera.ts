import type { AppState } from "@app/core";
import { dollhouseCamera, type Bounds, type CameraSetup } from "./framing.ts";

// Full-frame sensor height; the focal length of app_state.camera is relative to it.
const SENSOR_HEIGHT_MM = 24;

function fovFromFocalLength(focalLengthMm: number): number {
  return (2 * Math.atan(SENSOR_HEIGHT_MM / 2 / focalLengthMm) * 180) / Math.PI;
}

/** The camera stored in app_state when set, otherwise the dollhouse framing of the apartment. */
export function initialCamera(camera: AppState["camera"] | undefined, bounds: Bounds): CameraSetup {
  if (!camera) return dollhouseCamera(bounds);
  return { position: camera.position, target: camera.target, fov: fovFromFocalLength(camera.focalLength) };
}
