import { Bloom, EffectComposer, N8AO, Outline, SMAA, ToneMapping } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import { useOutlineTargets } from "./outlineTargets.ts";
import { useQualityLevel } from "./quality.ts";
import { tokenColor } from "./tokens.ts";

const AO_RADIUS_M = 0.7;
const AO_INTENSITY = 2.5;
const BLOOM_THRESHOLD = 1.6;
const BLOOM_INTENSITY = 0.2;
const BLOOM_SMOOTHING = 0.2;
const AO_FALLOFF = 1;
const AO_DENOISE_RADIUS = 12;
const SELECTED_OUTLINE_LAYER = 10;
const FLAGGED_OUTLINE_LAYER = 11;
const OUTLINE_STRENGTH = 8;
const OUTLINE_RESOLUTION_SCALE = 1;

/**
 * Post-processing: half-res N8AO, subtle bloom, SMAA, AgX tone mapping, then the two outlines so the
 * state colours (selected blue, flagged red) reach the screen unchanged. An outline without targets costs nothing.
 */
export function Effects() {
  const { aoSamples, denoiseSamples } = useQualityLevel();
  const selected = useOutlineTargets((state) => state.selected);
  const flagged = useOutlineTargets((state) => state.flagged);
  return (
    // The outline effect needs the composer not to clear between passes.
    <EffectComposer multisampling={0} autoClear={false}>
      <N8AO halfRes aoRadius={AO_RADIUS_M} distanceFalloff={AO_FALLOFF} intensity={AO_INTENSITY} aoSamples={aoSamples} denoiseSamples={denoiseSamples} denoiseRadius={AO_DENOISE_RADIUS} />
      <Bloom mipmapBlur luminanceThreshold={BLOOM_THRESHOLD} luminanceSmoothing={BLOOM_SMOOTHING} intensity={BLOOM_INTENSITY} />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Outline selection={selected} selectionLayer={SELECTED_OUTLINE_LAYER} visibleEdgeColor={tokenColor("--blue-bright")} xRay={false} resolutionScale={OUTLINE_RESOLUTION_SCALE} blendFunction={BlendFunction.ALPHA} edgeStrength={OUTLINE_STRENGTH} />
      <Outline selection={flagged} selectionLayer={FLAGGED_OUTLINE_LAYER} visibleEdgeColor={tokenColor("--red")} xRay={false} resolutionScale={OUTLINE_RESOLUTION_SCALE} blendFunction={BlendFunction.ALPHA} edgeStrength={OUTLINE_STRENGTH} />
    </EffectComposer>
  );
}
