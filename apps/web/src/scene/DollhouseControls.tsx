import { OrbitControls, type OrbitControlsChangeEvent } from "@react-three/drei";
import { MathUtils, Vector3 } from "three";
import type { Bounds, CameraSetup } from "./build/framing.ts";

const MIN_POLAR_ANGLE = MathUtils.degToRad(10);
const MAX_POLAR_ANGLE = MathUtils.degToRad(85);
const MIN_ZOOM_FACTOR = 0.3;
const MAX_ZOOM_FACTOR = 3;
const DAMPING_FACTOR = 0.1;
// The starting camera may sit farther out (it is fitted between the panels); zooming out can go a little beyond it.
const START_DISTANCE_HEADROOM = 1.25;

/** Dev only: `#/?fixture=seed&orbit=1` turns the camera slowly for fps measurements. */
const isAutoOrbit = import.meta.env.DEV && /[?&]orbit=1/.test(window.location.hash);

/** Orbit controls around the dollhouse target; panning is limited to the apartment bounds. */
export function DollhouseControls({ bounds, camera }: { bounds: Bounds; camera: CameraSetup }) {
  const startDistance = new Vector3(...camera.position).distanceTo(new Vector3(...camera.target));
  const maxDistance = Math.max(MAX_ZOOM_FACTOR * bounds.radius, startDistance * START_DISTANCE_HEADROOM);
  const panMin = new Vector3(...bounds.min);
  const panMax = new Vector3(...bounds.max);

  function limitPan(event?: OrbitControlsChangeEvent) {
    event?.target.target.clamp(panMin, panMax);
  }

  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={DAMPING_FACTOR}
      target={camera.target}
      minPolarAngle={MIN_POLAR_ANGLE}
      maxPolarAngle={MAX_POLAR_ANGLE}
      minDistance={MIN_ZOOM_FACTOR * bounds.radius}
      maxDistance={maxDistance}
      autoRotate={isAutoOrbit}
      autoRotateSpeed={6}
      onChange={limitPan}
    />
  );
}
