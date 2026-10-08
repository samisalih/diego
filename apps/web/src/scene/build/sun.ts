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

const DAY_SKY = { turbidity: 4, rayleigh: 1.5, mieCoefficient: 0.005, mieDirectionalG: 0.8 };
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
