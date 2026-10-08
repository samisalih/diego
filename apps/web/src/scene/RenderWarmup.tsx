import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";

/**
 * Keeps the per-frame cost down for a mostly static scene: the sun's shadow map is rendered when
 * `shadowKey` changes (document, sun, shadow size) instead of every frame, and every material program
 * is compiled up front so the first orbit never stalls on a shader build.
 */
export function RenderWarmup({ shadowKey }: { shadowKey: readonly unknown[] }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  // The outline effect makes the composer switch the renderer's autoClear off for good. Offscreen renders such as the
  // contact shadow bake would then paint over their previous result and leave ghost trails of everything that moved.
  // A negative priority runs before the bake and does not take over rendering (only positive priorities do).
  useFrame(() => {
    gl.autoClear = true;
  }, -1);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, ...shadowKey]);

  useEffect(() => {
    void gl.compileAsync(scene, camera);
  }, [gl, scene, camera]);

  return null;
}
