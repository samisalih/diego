import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { PMREMGenerator, Scene } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import type { SkyParams } from "./build/sun.ts";

const SKY_SCALE = 1000;
const SKY_FAR = 2000;
const SKY_MAP_SIZE = 512;
const NEUTRAL_ENVIRONMENT_BLUR_SIGMA = 0.04;

function createSkyScene({ turbidity, rayleigh, mieCoefficient, mieDirectionalG, sunPosition }: SkyParams): Scene {
  const sky = new Sky();
  sky.scale.setScalar(SKY_SCALE);
  const { uniforms } = sky.material;
  uniforms.turbidity!.value = turbidity;
  uniforms.rayleigh!.value = rayleigh;
  uniforms.mieCoefficient!.value = mieCoefficient;
  uniforms.mieDirectionalG!.value = mieDirectionalG;
  uniforms.sunPosition!.value.set(...sunPosition);
  uniforms.showSunDisc!.value = 0;
  uniforms.cloudCoverage!.value = 0;
  const skyScene = new Scene();
  skyScene.add(sky);
  return skyScene;
}

function disposeSceneContents(scene: Scene): void {
  scene.traverse((object) => {
    if ("geometry" in object) (object.geometry as { dispose(): void }).dispose();
    if ("material" in object) (object.material as { dispose(): void }).dispose();
  });
}

/**
 * Lighting environment: a neutral studio room baked once, so the blue sky never tints the interior
 * (oak must stay brown, beige tiles beige). Intensity comes from the lighting levels.
 */
export function NeutralEnvironment({ intensity }: { intensity: number }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const room = new RoomEnvironment();
    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(room, NEUTRAL_ENVIRONMENT_BLUR_SIGMA);
    pmrem.dispose();
    scene.environment = target.texture;
    return () => {
      scene.environment = null;
      target.dispose();
      disposeSceneContents(room);
    };
  }, [gl, scene]);

  useEffect(() => {
    scene.environmentIntensity = intensity;
  }, [scene, intensity]);

  return null;
}

/** The Preetham sky as the scene background only, baked once per sun change. */
export function SkyBackground({ skyParams, intensity }: { skyParams: SkyParams; intensity: number }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const skyScene = createSkyScene(skyParams);
    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(skyScene, 0, 0.1, SKY_FAR, { size: SKY_MAP_SIZE });
    pmrem.dispose();
    scene.background = target.texture;
    return () => {
      scene.background = null;
      target.dispose();
      disposeSceneContents(skyScene);
    };
  }, [gl, scene, skyParams]);

  useEffect(() => {
    scene.backgroundIntensity = intensity;
  }, [scene, intensity]);

  return null;
}
