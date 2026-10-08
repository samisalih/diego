import { Canvas } from "@react-three/fiber";
import { ContactShadows, PerformanceMonitor } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { useSceneStore } from "../data/store.ts";
import { installFrameStats } from "../dev/frameStats.ts";
import { ApartmentMeshes } from "./Apartment.tsx";
import { apartmentBounds, type CameraSetup } from "./build/framing.ts";
import { initialCamera } from "./build/initialCamera.ts";
import { sunSetup } from "./build/sun.ts";
import { DollhouseControls } from "./DollhouseControls.tsx";
import { Effects } from "./Effects.tsx";
import { Ground } from "./Ground.tsx";
import { ItemsMeshes } from "./Items.tsx";
import { useQualityLevel, useQualityStore } from "./quality.ts";
import { SkyEnvironment } from "./SkyEnvironment.tsx";
import { SunLight } from "./SunLight.tsx";
import { useDeepStable } from "./useDeepStable.ts";

const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 1500;
const TRANSMISSION_RESOLUTION_SCALE = 0.5;
const CONTACT_SHADOW_RESOLUTION = 512;
const CONTACT_SHADOW_REACH_M = 0.6;

/** Everything inside the canvas; reads the active document from the store. */
function SceneContent({ cameraSetup }: { cameraSetup: CameraSetup }) {
  const document = useSceneStore((state) => state.document);
  const assets = useSceneStore((state) => state.assets);
  const materials = useSceneStore((state) => state.materials);
  const { shadowMapSize } = useQualityLevel();
  const apartment = useDeepStable(document?.apartment);
  const lighting = useDeepStable(document?.lighting);
  const bounds = useMemo(() => (apartment ? apartmentBounds(apartment) : null), [apartment]);
  const sun = useMemo(
    () => (apartment && lighting ? sunSetup({ lighting, meta: apartment.meta, year: new Date().getFullYear() }) : null),
    [apartment?.meta, lighting],
  );

  if (!document || !apartment || !bounds || !sun) return null;
  const [width, depth] = [bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]];

  return (
    <>
      <SkyEnvironment skyParams={sun.skyParams} environmentIntensity={0.25} backgroundIntensity={0.5} />
      <hemisphereLight args={["#ffffff", "#d8cdb8", 0.7]} />
      <SunLight sun={sun} bounds={bounds} shadowMapSize={shadowMapSize} />
      <Ground />
      <ApartmentMeshes apartment={apartment} materials={materials} />
      <ItemsMeshes items={document.items} assets={assets} materials={materials} />
      <ContactShadows
        key={document.version}
        position={[bounds.center[0], 0.002, bounds.center[2]]}
        width={width}
        height={depth}
        far={CONTACT_SHADOW_REACH_M}
        resolution={CONTACT_SHADOW_RESOLUTION}
        opacity={0.5}
        blur={2}
        frames={1}
      />
      <DollhouseControls bounds={bounds} camera={cameraSetup} />
    </>
  );
}

/** The starting camera, computed once from the first document that is shown. */
function useInitialCamera(): CameraSetup | null {
  const document = useSceneStore((state) => state.document);
  const appCamera = useSceneStore((state) => state.appState?.camera);
  // Deliberately computed once: later document updates must not yank the user's camera.
  return useMemo(() => (document ? initialCamera(appCamera, apartmentBounds(document.apartment)) : null), []);
}

/** The R3F canvas with adaptive quality; fills its parent and has nothing drawn over it. */
export function Viewport() {
  const { dpr } = useQualityLevel();
  const camera = useInitialCamera();
  const stepDown = useQualityStore((state) => state.stepDown);
  const stepUp = useQualityStore((state) => state.stepUp);

  useEffect(() => (import.meta.env.DEV ? installFrameStats(() => useQualityStore.getState().levelIndex) : undefined), []);

  return (
    <Canvas
      flat
      shadows="percentage"
      dpr={dpr}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      camera={camera ? { position: camera.position, fov: camera.fov, near: CAMERA_NEAR, far: CAMERA_FAR } : undefined}
      onCreated={({ gl }) => {
        gl.transmissionResolutionScale = TRANSMISSION_RESOLUTION_SCALE;
      }}
    >
      <PerformanceMonitor onDecline={stepDown} onIncline={stepUp}>
        {camera && <SceneContent cameraSetup={camera} />}
        <Effects />
      </PerformanceMonitor>
    </Canvas>
  );
}
