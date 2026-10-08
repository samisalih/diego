import { goldenHourTime, type SunLocation } from "./sun.ts";

export const PRESET_IDS = ["morningCoffee", "noon", "goldenHour", "cozyEvening", "movieNight"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export interface LightingPreset {
  time: number | "goldenHour";
  effectsEnabled: boolean;
  mood: { grain: number; vignette: number; lightLeak: number; halftone: number };
}

export const LIGHTING_PRESETS: Record<PresetId, LightingPreset> = {
  morningCoffee: { time: 7.5, effectsEnabled: true, mood: { grain: 0.2, vignette: 0.2, lightLeak: 0.3, halftone: 0 } },
  noon: { time: 12.5, effectsEnabled: false, mood: { grain: 0, vignette: 0, lightLeak: 0, halftone: 0 } },
  goldenHour: { time: "goldenHour", effectsEnabled: true, mood: { grain: 0.3, vignette: 0.3, lightLeak: 0.5, halftone: 0 } },
  cozyEvening: { time: 20, effectsEnabled: true, mood: { grain: 0.4, vignette: 0.5, lightLeak: 0.2, halftone: 0 } },
  movieNight: { time: 21.5, effectsEnabled: true, mood: { grain: 0.6, vignette: 0.7, lightLeak: 0.1, halftone: 0.2 } },
};

const DEFAULT_SPOT_ANGLE_DEG = 60;
// Used when the sun never crosses the golden hour altitude (polar day or night).
const FALLBACK_GOLDEN_HOUR = 19.5;

export function lumensToCandela(lumens: number, type: "point" | "spot" | "area", spotAngleDeg = DEFAULT_SPOT_ANGLE_DEG): number {
  if (type !== "spot") return lumens / (4 * Math.PI);
  const halfAngle = (spotAngleDeg * Math.PI) / 360;
  return lumens / (2 * Math.PI * (1 - Math.cos(halfAngle)));
}

export function resolvePresetTime(presetId: PresetId, location: SunLocation): number {
  const { time } = LIGHTING_PRESETS[presetId];
  return time === "goldenHour" ? (goldenHourTime(location) ?? FALLBACK_GOLDEN_HOUR) : time;
}
