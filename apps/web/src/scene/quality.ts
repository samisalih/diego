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

/** Dev only: `&dpr=2` pretends a Retina screen so the render cost can be measured on a 1x display. */
function nativeDpr(): number {
  const override = import.meta.env.DEV ? Number(new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("dpr")) : 0;
  return override > 0 ? override : window.devicePixelRatio || 1;
}

export const QUALITY_LEVELS = buildQualityLevels(nativeDpr());

type QualityState = {
  levelIndex: number;
  /** Set once the monitor keeps flip-flopping; the level then stays where it is. */
  isSettled: boolean;
  stepDown: () => void;
  stepUp: () => void;
  /** Takes one last step down (the borderline level is not sustainable) and stops adapting. */
  settle: () => void;
};

/** The current adaptive quality step; session state, never persisted. */
/** Dev only: `&level=N` pins the quality step for profiling. */
function pinnedDevLevel(): number | null {
  if (!import.meta.env.DEV) return null;
  const raw = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("level");
  return raw === null ? null : Math.min(Math.max(Number(raw) || 0, 0), QUALITY_LEVELS.length - 1);
}

const pinnedLevel = pinnedDevLevel();

export const useQualityStore = create<QualityState>()((set) => ({
  levelIndex: pinnedLevel ?? 0,
  isSettled: pinnedLevel !== null,
  stepDown: () => set((state) => (state.isSettled ? state : { levelIndex: Math.min(state.levelIndex + 1, QUALITY_LEVELS.length - 1) })),
  stepUp: () => set((state) => (state.isSettled ? state : { levelIndex: Math.max(state.levelIndex - 1, 0) })),
  settle: () => set((state) => ({ isSettled: true, levelIndex: Math.min(state.levelIndex + 1, QUALITY_LEVELS.length - 1) })),
}));

export function useQualityLevel(): QualityLevel {
  return QUALITY_LEVELS[useQualityStore((state) => state.levelIndex)]!;
}
