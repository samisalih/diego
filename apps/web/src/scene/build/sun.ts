import { sunLight, sunPosition, type ApartmentMeta, type Lighting, type Vec3 } from "@app/core";

export type SkyParams = {
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  sunPosition: Vec3;
};

export type SunSetup = {
  /** Unit vector from the scene towards the sun. */
  direction: Vec3;
  altitudeDeg: number;
  color: Vec3;
  /** DirectionalLight intensity in scene units, already multiplied by the exposure factor. */
  intensity: number;
  isNight: boolean;
  skyParams: SkyParams;
};

const NIGHT_ALTITUDE_DEG = -0.83;
const SKY_DISTANCE = 1000;

const DAY_SKY = { turbidity: 8, rayleigh: 0.7, mieCoefficient: 0.01, mieDirectionalG: 0.8 };
const NIGHT_SKY = { turbidity: 0.5, rayleigh: 0.05, mieCoefficient: 0.001, mieDirectionalG: 0.7 };

// Camera-like auto exposure as [sun altitude in degrees, exposure] knots, interpolated in log space.
// Noon sunlight (~100 klx) lands at a light intensity of ~2.5, the horizon sun at ~0.6, the night is
// lifted by 10x so the scene stays dim but readable.
const EXPOSURE_KNOTS: Array<[number, number]> = [
  [-18, 3e-3],
  [0, 3e-4],
  [60, 2.5e-5],
];

/**
 * Scene exposure for a sun altitude: lowest at a high noon sun, rising towards the horizon and
 * further into the night; never increasing with the altitude.
 */
export function exposureForSun(altitudeDeg: number): number {
  const [firstAltitude, firstExposure] = EXPOSURE_KNOTS[0]!;
  const [lastAltitude, lastExposure] = EXPOSURE_KNOTS[EXPOSURE_KNOTS.length - 1]!;
  if (altitudeDeg <= firstAltitude) return firstExposure;
  if (altitudeDeg >= lastAltitude) return lastExposure;
  const upperIndex = EXPOSURE_KNOTS.findIndex(([altitude]) => altitude >= altitudeDeg);
  const [lowAltitude, lowExposure] = EXPOSURE_KNOTS[upperIndex - 1]!;
  const [highAltitude, highExposure] = EXPOSURE_KNOTS[upperIndex]!;
  const share = (altitudeDeg - lowAltitude) / (highAltitude - lowAltitude);
  return Math.exp(Math.log(lowExposure) + share * (Math.log(highExposure) - Math.log(lowExposure)));
}

/** Light, colour, intensity and sky parameters for the lighting state and apartment location. */
export function sunSetup(input: { lighting: Lighting; meta: ApartmentMeta; year: number }): SunSetup {
  const { lighting, meta, year } = input;
  const { altitudeDeg, direction } = sunPosition({
    time: lighting.time,
    season: lighting.season,
    latitude: meta.latitude,
    longitude: meta.longitude,
    timeZone: meta.timeZone,
    northAngle: meta.northAngle,
    year,
  });
  const { color, illuminanceLux } = sunLight(altitudeDeg);
  const isNight = altitudeDeg < NIGHT_ALTITUDE_DEG;
  return {
    direction,
    altitudeDeg,
    color,
    // With physically based units a DirectionalLight's intensity is the illuminance in lux.
    intensity: isNight ? 0 : illuminanceLux * exposureForSun(altitudeDeg),
    isNight,
    skyParams: {
      ...(isNight ? NIGHT_SKY : DAY_SKY),
      sunPosition: direction.map((component) => component * SKY_DISTANCE) as Vec3,
    },
  };
}

export type LightingLevels = {
  sunIntensity: number;
  environmentIntensity: number;
  backgroundIntensity: number;
  hemisphereIntensity: number;
  /** `#rrggbb` (sRGB). */
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
};

// The sun fades in over its first degrees above the horizon, so the light never switches on with a step.
const SUN_FADE_IN_ALTITUDE_DEG = 8;
// Ambient levels blend between night and day across this altitude range.
const AMBIENT_BLEND_RANGE_DEG: [number, number] = [-8, 8];
const DAY_LEVELS = { environment: 0.65, background: 0.5, hemisphere: 0.4 };
const NIGHT_LEVELS = { environment: 0.14, background: 1, hemisphere: 0.12 };
const DAY_HEMISPHERE_SKY: Vec3 = [1, 1, 1];
const DAY_HEMISPHERE_GROUND: Vec3 = [0.85, 0.8, 0.72];
const NIGHT_HEMISPHERE_SKY: Vec3 = [0.55, 0.62, 0.8];
const NIGHT_HEMISPHERE_GROUND: Vec3 = [0.25, 0.25, 0.3];
// How far the day hemisphere sky is pulled towards the colour of the sun (golden hour warms the room).
const SUN_COLOUR_TINT = 0.25;

function smoothstep(low: number, high: number, value: number): number {
  const x = Math.min(Math.max((value - low) / (high - low), 0), 1);
  return x * x * (3 - 2 * x);
}

const lerp = (from: number, to: number, share: number): number => from + (to - from) * share;

function lerpColour(from: Vec3, to: Vec3, share: number): Vec3 {
  return from.map((channel, index) => lerp(channel, to[index]!, share)) as Vec3;
}

function toHex(colour: Vec3): string {
  return `#${colour.map((channel) => Math.round(Math.min(Math.max(channel, 0), 1) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Every light intensity of the scene for a sun setup. The sun fades in above the horizon, ambient
 * light (neutral environment, hemisphere fill) blends between a dim night and the day level.
 */
export function lightingLevels(sun: SunSetup): LightingLevels {
  const daylight = smoothstep(AMBIENT_BLEND_RANGE_DEG[0], AMBIENT_BLEND_RANGE_DEG[1], sun.altitudeDeg);
  const daySky = lerpColour(DAY_HEMISPHERE_SKY, sun.color, SUN_COLOUR_TINT);
  return {
    sunIntensity: sun.intensity * smoothstep(0, SUN_FADE_IN_ALTITUDE_DEG, sun.altitudeDeg),
    environmentIntensity: lerp(NIGHT_LEVELS.environment, DAY_LEVELS.environment, daylight),
    backgroundIntensity: lerp(NIGHT_LEVELS.background, DAY_LEVELS.background, daylight),
    hemisphereIntensity: lerp(NIGHT_LEVELS.hemisphere, DAY_LEVELS.hemisphere, daylight),
    hemisphereSkyColor: toHex(lerpColour(NIGHT_HEMISPHERE_SKY, daySky, daylight)),
    hemisphereGroundColor: toHex(lerpColour(NIGHT_HEMISPHERE_GROUND, DAY_HEMISPHERE_GROUND, daylight)),
  };
}
