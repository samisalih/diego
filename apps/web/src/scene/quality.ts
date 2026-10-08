import { create } from "zustand";

/** Render settings of one adaptive quality step. */
export type QualityLevel = {
  dpr: number;
  aoSamples: number;
  denoiseSamples: number;
  shadowMapSize: number;
  hasTransmission: boolean;
};

const DPR_STEPS = [2, 1.5, 1];
const FULL_AO = { aoSamples: 16, denoiseSamples: 4 };
const LOW_AO = { aoSamples: 8, denoiseSamples: 4 };

/**
 * Quality steps from best to worst, in the order of the spec: dpr 2 -> 1.5 -> 1, AO quality,
 * shadow map 2048 -> 1024, transmission -> plain transparent glass. Dpr steps above the screen's
 * native ratio would only supersample, so they collapse into one.
 */
export function buildQualityLevels(nativeDpr: number): QualityLevel[] {
  const dprs = [...new Set(DPR_STEPS.map((dpr) => Math.min(dpr, nativeDpr)))];
  const best = { ...FULL_AO, shadowMapSize: 2048, hasTransmission: true };
  const dprLevels = dprs.map((dpr) => ({ ...best, dpr }));
  const lowestDpr = dprs[dprs.length - 1]!;
  const lowAo = { ...best, ...LOW_AO, dpr: lowestDpr };
  const smallShadows = { ...lowAo, shadowMapSize: 1024 };
  const plainGlass = { ...smallShadows, hasTransmission: false };
  return [...dprLevels, lowAo, smallShadows, plainGlass];
}

export const QUALITY_LEVELS = buildQualityLevels(window.devicePixelRatio || 1);

type QualityState = {
  levelIndex: number;
  stepDown: () => void;
  stepUp: () => void;
};

/** The current adaptive quality step; session state, never persisted. */
export const useQualityStore = create<QualityState>()((set) => ({
  levelIndex: 0,
  stepDown: () => set((state) => ({ levelIndex: Math.min(state.levelIndex + 1, QUALITY_LEVELS.length - 1) })),
  stepUp: () => set((state) => ({ levelIndex: Math.max(state.levelIndex - 1, 0) })),
}));

export function useQualityLevel(): QualityLevel {
  return QUALITY_LEVELS[useQualityStore((state) => state.levelIndex)]!;
}
