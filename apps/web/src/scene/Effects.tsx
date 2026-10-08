import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useQualityLevel } from "./quality.ts";

const AO_RADIUS_M = 0.7;
const AO_INTENSITY = 2.5;
const BLOOM_THRESHOLD = 1.6;
const BLOOM_INTENSITY = 0.2;

/** Post-processing: half-res N8AO, subtle bloom, SMAA, and AgX tone mapping as the last effect. */
export function Effects() {
  const { aoSamples, denoiseSamples } = useQualityLevel();
  return (
    <EffectComposer multisampling={0}>
      <N8AO halfRes aoRadius={AO_RADIUS_M} distanceFalloff={1} intensity={AO_INTENSITY} aoSamples={aoSamples} denoiseSamples={denoiseSamples} denoiseRadius={12} />
      <Bloom mipmapBlur luminanceThreshold={BLOOM_THRESHOLD} luminanceSmoothing={0.2} intensity={BLOOM_INTENSITY} />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  );
}
