import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useQualityLevel } from "./quality.ts";

const AO_RADIUS_M = 0.7;
const AO_INTENSITY = 2.5;
const BLOOM_THRESHOLD = 1.6;
const BLOOM_INTENSITY = 0.2;
const BLOOM_SMOOTHING = 0.2;
const AO_FALLOFF = 1;
const AO_DENOISE_RADIUS = 12;

/** Post-processing: half-res N8AO, subtle bloom, SMAA, and AgX tone mapping as the last effect. */
export function Effects() {
  const { aoSamples, denoiseSamples } = useQualityLevel();
  return (
    <EffectComposer multisampling={0}>
      <N8AO halfRes aoRadius={AO_RADIUS_M} distanceFalloff={AO_FALLOFF} intensity={AO_INTENSITY} aoSamples={aoSamples} denoiseSamples={denoiseSamples} denoiseRadius={AO_DENOISE_RADIUS} />
      <Bloom mipmapBlur luminanceThreshold={BLOOM_THRESHOLD} luminanceSmoothing={BLOOM_SMOOTHING} intensity={BLOOM_INTENSITY} />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  );
}
