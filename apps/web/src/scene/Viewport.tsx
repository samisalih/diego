import { Canvas } from "@react-three/fiber";
import { ContactShadows, PerformanceMonitor } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import { useSceneStore } from "../data/store.ts";
import { installFrameStats, markFrameEvent } from "../dev/frameStats.ts";
import { useEditorStore } from "../editor/editorStore.ts";
import { useEffectiveItems, useLayoutAnalysis } from "../editor/layoutAnalysis.ts";
import { outlineGroups } from "../editor/viewportFeedback.ts";
import { ApartmentMeshes } from "./Apartment.tsx";
import { apartmentBounds, type CameraSetup } from "./build/framing.ts";
import { initialCamera } from "./build/initialCamera.ts";
import { lightingLevels, sunSetup } from "./build/sun.ts";
import { DollhouseControls } from "./DollhouseControls.tsx";
import { Effects } from "./Effects.tsx";
import { EditorOverlays } from "./EditorOverlays.tsx";
import { RenderWarmup } from "./RenderWarmup.tsx";
import { Ground } from "./Ground.tsx";
import { ItemsMeshes } from "./Items.tsx";
import { QUALITY_LEVELS, useQualityLevel, useQualityStore } from "./quality.ts";
import { NeutralEnvironment, SkyBackground } from "./SkyEnvironment.tsx";
import { SunLight } from "./SunLight.tsx";
import { useDeepStable } from "./useDeepStable.ts";
import { useItemInteraction } from "./useItemInteraction.ts";
import { withDevCameraOverride } from "../dev/cameraOverride.ts";
import { withDevLightingOverride } from "../dev/lightingOverride.ts";

const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 1500;
const TRANSMISSION_RESOLUTION_SCALE = 0.5;
const CONTACT_SHADOW_RESOLUTION = 512;
const CONTACT_SHADOW_REACH_M = 0.6;
const CONTACT_SHADOW_LIFT_M = 0.002;
const CONTACT_SHADOW_OPACITY = 0.5;
const CONTACT_SHADOW_BLUR = 2;
const MONITOR_MAX_FLIPFLOPS = 3;
// Hysteresis between stepping down and back up so a step never immediately undoes itself.
const MONITOR_BOUNDS_60HZ: [number, number] = [45, 58];
const MONITOR_BOUNDS_HIGH_REFRESH: [number, number] = [55, 100];
const HIGH_REFRESH_RATE_HZ = 100;
// Shader compilation and the first bakes stall the first frames; sampling starts after that.
const MONITOR_WARMUP_MS = 4000;

/**
 * fps bounds for the monitor. At the best level there is nothing to step up to and at the worst nothing
 * to step down to; unreachable bounds there keep those windows from counting as flip-flops.
 */
function monitorBounds(refreshRate: number): [number, number] {
  const [lower, upper] = refreshRate > HIGH_REFRESH_RATE_HZ ? MONITOR_BOUNDS_HIGH_REFRESH : MONITOR_BOUNDS_60HZ;
  const { levelIndex } = useQualityStore.getState();
  return [levelIndex === QUALITY_LEVELS.length - 1 ? 0 : lower, levelIndex === 0 ? Infinity : upper];
}

/** Everything inside the canvas; reads the active document from the store. */
function SceneContent({ cameraSetup }: { cameraSetup: CameraSetup }) {
  const document = useSceneStore((state) => state.document);
  const assets = useSceneStore((state) => state.assets);
  const materials = useSceneStore((state) => state.materials);
  const { shadowMapSize } = useQualityLevel();
  const items = useEffectiveItems();
  const analysis = useLayoutAnalysis();
  const selectedIds = useEditorStore((state) => state.selection.selectedIds);
  const handlers = useItemInteraction();
  const apartment = useDeepStable(document?.apartment);
  const lighting = useDeepStable(withDevLightingOverride(document?.lighting));
  const bounds = useMemo(() => (apartment ? apartmentBounds(apartment) : null), [apartment]);
  const sun = useMemo(
    () => (apartment && lighting ? sunSetup({ lighting, meta: apartment.meta, year: new Date().getFullYear() }) : null),
    [apartment?.meta, lighting],
  );
  const levels = useMemo(() => (sun ? lightingLevels(sun) : null), [sun]);

  const outlinesNow = useMemo(() => outlineGroups(items, selectedIds, analysis?.issues ?? []), [items, selectedIds, analysis]);
  const outlines = useDeepStable(outlinesNow);

  if (!document || !apartment || !bounds || !sun || !levels) return null;
  const [width, depth] = [bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]];

  return (
    <>
      <NeutralEnvironment intensity={levels.environmentIntensity} />
      <SkyBackground skyParams={sun.skyParams} intensity={levels.backgroundIntensity} />
      <hemisphereLight color={levels.hemisphereSkyColor} groundColor={levels.hemisphereGroundColor} intensity={levels.hemisphereIntensity} />
      <SunLight sun={sun} intensity={levels.sunIntensity} bounds={bounds} shadowMapSize={shadowMapSize} />
      <Ground />
      <ApartmentMeshes apartment={apartment} materials={materials} />
      <ItemsMeshes items={items} assets={assets} materials={materials} selectedIds={outlines.blueIds} flaggedIds={outlines.redIds} handlers={handlers} />
      <EditorOverlays />
      {/* frames=1 renders the depth once per re-render of this component, i.e. once per scene change. */}
      <ContactShadows
        position={[bounds.center[0], CONTACT_SHADOW_LIFT_M, bounds.center[2]]}
        width={width}
        height={depth}
        far={CONTACT_SHADOW_REACH_M}
        resolution={CONTACT_SHADOW_RESOLUTION}
        opacity={CONTACT_SHADOW_OPACITY}
        blur={CONTACT_SHADOW_BLUR}
        frames={1}
      />
      <DollhouseControls bounds={bounds} camera={cameraSetup} />
      <RenderWarmup shadowKey={[items, apartment, assets, sun, levels.sunIntensity, shadowMapSize]} />
    </>
  );
}

/** The starting camera, computed once from the first document that is shown. */
function useInitialCamera(): CameraSetup | null {
  const document = useSceneStore((state) => state.document);
  const appCamera = useSceneStore((state) => state.appState?.camera);
  // Deliberately computed once: later document updates must not yank the user's camera.
  return useMemo(() => (document ? withDevCameraOverride(initialCamera(appCamera, apartmentBounds(document.apartment))) : null), []);
}

/** Mounts the performance monitor only after the warm-up, so start-up hitches never cost quality. */
function WarmedUpMonitor() {
  const [isWarm, setIsWarm] = useState(false);
  const stepDown = useQualityStore((state) => state.stepDown);
  const stepUp = useQualityStore((state) => state.stepUp);
  const settle = useQualityStore((state) => state.settle);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (import.meta.env.DEV) markFrameEvent("monitor on");
      setIsWarm(true);
    }, MONITOR_WARMUP_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!isWarm) return null;
  return <PerformanceMonitor bounds={monitorBounds} flipflops={MONITOR_MAX_FLIPFLOPS} onDecline={stepDown} onIncline={stepUp} onFallback={settle} />;
}

function clearSelectionOnEmptyClick(event: MouseEvent): void {
  if (event.shiftKey || event.metaKey || event.ctrlKey) return;
  useEditorStore.getState().dispatchSelection({ type: "clear" });
}

/** The R3F canvas with adaptive quality; fills its parent and has nothing drawn over it. */
export function Viewport() {
  const { dpr } = useQualityLevel();
  const camera = useInitialCamera();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const stopStats = installFrameStats(() => useQualityStore.getState().levelIndex);
    const stopQualityMarks = useQualityStore.subscribe((state) => markFrameEvent(`quality level ${state.levelIndex}`));
    const stopSceneMarks = useSceneStore.subscribe(() => markFrameEvent("scene store changed"));
    return () => {
      stopStats();
      stopQualityMarks();
      stopSceneMarks();
    };
  }, []);

  return (
    <Canvas
      flat
      shadows="percentage"
      dpr={dpr}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      camera={camera ? { position: camera.position, fov: camera.fov, near: CAMERA_NEAR, far: CAMERA_FAR } : undefined}
      onPointerMissed={clearSelectionOnEmptyClick}
      onCreated={({ gl }) => {
        gl.transmissionResolutionScale = TRANSMISSION_RESOLUTION_SCALE;
      }}
    >
      <WarmedUpMonitor />
      {camera && <SceneContent cameraSetup={camera} />}
      <Effects />
    </Canvas>
  );
}
