import { goldenHourTime, type SunLocation } from "./sun.ts";

export type Rgb = [number, number, number];

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

const MIN_KELVIN = 1000;
const MAX_KELVIN = 40000;
const DEFAULT_SPOT_ANGLE_DEG = 60;

const toUnitChannel = (value: number): number => Math.min(Math.max(value, 0), 255) / 255;

/** Tanner Helland approximation of a black-body colour, components 0..1. */
export function kelvinToRgb(kelvin: number): Rgb {
  const t = Math.min(Math.max(kelvin, MIN_KELVIN), MAX_KELVIN) / 100;
  const red = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const green = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [toUnitChannel(red), toUnitChannel(green), toUnitChannel(blue)];
}

export function lumensToCandela(lumens: number, type: "point" | "spot" | "area", spotAngleDeg = DEFAULT_SPOT_ANGLE_DEG): number {
  if (type !== "spot") return lumens / (4 * Math.PI);
  const halfAngle = (spotAngleDeg * Math.PI) / 360;
  return lumens / (2 * Math.PI * (1 - Math.cos(halfAngle)));
}

export function resolvePresetTime(presetId: PresetId, location: SunLocation): number {
  const { time } = LIGHTING_PRESETS[presetId];
  return time === "goldenHour" ? goldenHourTime(location) : time;
}
