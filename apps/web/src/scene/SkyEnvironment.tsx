import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { PMREMGenerator, Scene } from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import type { SkyParams } from "./build/sun.ts";

const SKY_SCALE = 1000;
const SKY_FAR = 2000;
const ENVIRONMENT_SIZE = 512;

function createSkyScene({ turbidity, rayleigh, mieCoefficient, mieDirectionalG, sunPosition }: SkyParams): Scene {
  const sky = new Sky();
  sky.scale.setScalar(SKY_SCALE);
  const { uniforms } = sky.material;
  uniforms.turbidity!.value = turbidity;
  uniforms.rayleigh!.value = rayleigh;
  uniforms.mieCoefficient!.value = mieCoefficient;
  uniforms.mieDirectionalG!.value = mieDirectionalG;
  uniforms.sunPosition!.value.set(...sunPosition);
  // The directional light is the sun; a disc in the environment would light the room twice.
  uniforms.showSunDisc!.value = 0;
  uniforms.cloudCoverage!.value = 0;
  const skyScene = new Scene();
  skyScene.add(sky);
  return skyScene;
}

/** Bakes the Preetham sky once per sun change into a PMREM map used as environment and background. */
export function SkyEnvironment({ skyParams, environmentIntensity, backgroundIntensity }: { skyParams: SkyParams; environmentIntensity: number; backgroundIntensity: number }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const skyScene = createSkyScene(skyParams);
    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(skyScene, 0, 0.1, SKY_FAR, { size: ENVIRONMENT_SIZE });
    pmrem.dispose();
    scene.environment = target.texture;
    scene.background = target.texture;
    invalidate();
    return () => {
      scene.environment = null;
      scene.background = null;
      target.dispose();
      skyScene.traverse((object) => {
        if ("geometry" in object) (object.geometry as { dispose(): void }).dispose();
        if ("material" in object) (object.material as { dispose(): void }).dispose();
      });
    };
  }, [gl, scene, invalidate, skyParams]);

  useEffect(() => {
    scene.environmentIntensity = environmentIntensity;
    scene.backgroundIntensity = backgroundIntensity;
  }, [scene, environmentIntensity, backgroundIntensity]);

  return null;
}
