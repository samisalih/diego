import type { CameraSetup } from "../scene/build/framing.ts";

/** Dev only: `&cam=px,py,pz,tx,ty,tz` replaces the starting camera so a spot can be inspected up close. */
export function withDevCameraOverride(camera: CameraSetup): CameraSetup {
  if (!import.meta.env.DEV) return camera;
  const raw = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("cam");
  const values = raw?.split(",").map(Number);
  if (!values || values.length !== 6 || values.some((value) => !Number.isFinite(value))) return camera;
  const [px, py, pz, tx, ty, tz] = values as [number, number, number, number, number, number];
  return { ...camera, position: [px, py, pz], target: [tx, ty, tz] };
}
