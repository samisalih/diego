import { useLayoutEffect, useRef } from "react";
import { Color, SRGBColorSpace, type DirectionalLight, type Object3D } from "three";
import type { Bounds } from "./build/framing.ts";
import type { SunSetup } from "./build/sun.ts";

const FIT_MARGIN = 1.05;
const SHADOW_BIAS = -0.0004;
const SHADOW_NORMAL_BIAS = 0.02;

/** The only shadow-casting light: a directional sun whose shadow frustum is fitted to the apartment bounds. */
export function SunLight({ sun, bounds, shadowMapSize }: { sun: SunSetup; bounds: Bounds; shadowMapSize: number }) {
  const lightRef = useRef<DirectionalLight>(null);
  const targetRef = useRef<Object3D>(null);
  const reach = bounds.radius * FIT_MARGIN;
  const distance = reach * 2;
  const [x, y, z] = bounds.center;
  const [dx, dy, dz] = sun.direction;
  const color = new Color().setRGB(...sun.color, SRGBColorSpace);

  useLayoutEffect(() => {
    const light = lightRef.current;
    const target = targetRef.current;
    if (!light || !target) return;
    light.target = target;
    const { camera } = light.shadow;
    camera.left = -reach;
    camera.right = reach;
    camera.top = reach;
    camera.bottom = -reach;
    camera.near = distance - reach;
    camera.far = distance + reach;
    camera.updateProjectionMatrix();
  }, [reach, distance]);

  return (
    <>
      <object3D ref={targetRef} position={[x, y, z]} />
      <directionalLight
        key={shadowMapSize}
        ref={lightRef}
        position={[x + dx * distance, y + dy * distance, z + dz * distance]}
        color={color}
        intensity={sun.intensity}
        visible={!sun.isNight}
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-bias={SHADOW_BIAS}
        shadow-normalBias={SHADOW_NORMAL_BIAS}
      />
    </>
  );
}
