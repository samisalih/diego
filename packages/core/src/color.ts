import type { Vec3 } from "./math.ts";

export type Rgb = Vec3;

const MIN_KELVIN = 1000;
const MAX_KELVIN = 40000;

const toUnitChannel = (value: number): number => Math.min(Math.max(value, 0), 255) / 255;

/** Tanner Helland approximation of a black-body colour, components 0..1. */
export function kelvinToRgb(kelvin: number): Rgb {
  const t = Math.min(Math.max(kelvin, MIN_KELVIN), MAX_KELVIN) / 100;
  const red = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const green = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [toUnitChannel(red), toUnitChannel(green), toUnitChannel(blue)];
}
