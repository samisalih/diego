import { sunLight, sunPosition, type ApartmentMeta, type Lighting } from "@app/core";
import { SEED_DOCUMENT } from "../../../packages/core/src/seed/index.ts";
import { describe, expect, it } from "vitest";
import { exposureForSun, lightingLevels, sunSetup } from "../src/scene/build/sun.ts";

const { meta } = SEED_DOCUMENT.apartment;
const YEAR = 2026;
const NIGHT_ALTITUDE_DEG = -0.83;

const setup = (lighting: Partial<Lighting>, metaOverrides: Partial<ApartmentMeta> = {}) =>
  sunSetup({ lighting: { ...SEED_DOCUMENT.lighting, ...lighting }, meta: { ...meta, ...metaOverrides }, year: YEAR });

const coreSun = (lighting: Partial<Lighting>, metaOverrides: Partial<ApartmentMeta> = {}) => {
  const merged = { ...SEED_DOCUMENT.lighting, ...lighting };
  const m = { ...meta, ...metaOverrides };
  return sunPosition({ time: merged.time, season: merged.season, latitude: m.latitude, longitude: m.longitude, timeZone: m.timeZone, northAngle: m.northAngle, year: YEAR });
};

const normalise = (v: number[]) => {
  const length = Math.hypot(...v);
  return v.map((c) => c / length);
};

describe("sunSetup", () => {
  describe("daytime (summer, 16:00)", () => {
    // Red if direction or altitude are not taken from core's sunPosition.
    it("takes direction and altitude from core's sunPosition", () => {
      const result = setup({ time: 16, season: "summer" });
      const expected = coreSun({ time: 16, season: "summer" });
      expect(result.altitudeDeg).toBeCloseTo(expected.altitudeDeg, 6);
      result.direction.forEach((component, i) => expect(component).toBeCloseTo(expected.direction[i]!, 6));
    });

    // Red if the colour is not core's sunLight colour for that altitude.
    it("takes the colour from core's sunLight", () => {
      const result = setup({ time: 16, season: "summer" });
      sunLight(result.altitudeDeg).color.forEach((channel, i) => expect(result.color[i]).toBeCloseTo(channel, 6));
    });

    // Red if the sun is dark at day.
    it("is a lit day with positive finite intensity", () => {
      const result = setup({ time: 12.5, season: "summer" });
      expect(result.isNight).toBe(false);
      expect(result.intensity).toBeGreaterThan(0);
      expect(Number.isFinite(result.intensity)).toBe(true);
    });

    // Red if the light direction is not a unit vector pointing above the horizon.
    it("has a unit direction with positive y", () => {
      const { direction } = setup({ time: 12.5, season: "summer" });
      expect(Math.hypot(...direction)).toBeCloseTo(1, 6);
      expect(direction[1]).toBeGreaterThan(0);
    });
  });

  describe("meta handling", () => {
    // Red if northAngle is ignored: rotating north by 90 degrees turns the horizontal direction.
    it("rotates the direction with the north angle", () => {
      const north0 = setup({ time: 16 }, { northAngle: 0 });
      const north90 = setup({ time: 16 }, { northAngle: 90 });
      const expected = coreSun({ time: 16 }, { northAngle: 90 });
      north90.direction.forEach((component, i) => expect(component).toBeCloseTo(expected.direction[i]!, 6));
      expect(north90.direction[0]).not.toBeCloseTo(north0.direction[0], 3);
      expect(north90.altitudeDeg).toBeCloseTo(north0.altitudeDeg, 6);
    });

    // Red if the season is ignored: the winter noon sun stands lower than the summer noon sun.
    it("reflects the season in the altitude", () => {
      expect(setup({ time: 12.5, season: "winter" }).altitudeDeg).toBeLessThan(setup({ time: 12.5, season: "summer" }).altitudeDeg);
    });

    // Red if the location in meta is ignored.
    it("uses the latitude of the meta", () => {
      const leipzig = setup({ time: 12.5, season: "summer" });
      const equator = setup({ time: 12.5, season: "summer" }, { latitude: 0 });
      expect(equator.altitudeDeg).not.toBeCloseTo(leipzig.altitudeDeg, 1);
    });
  });

  describe("night", () => {
    const result = setup({ time: 0, season: "winter" });

    // Red if the night flag is wrong.
    it("flags night when the sun is below -0.83 degrees", () => {
      expect(result.altitudeDeg).toBeLessThan(NIGHT_ALTITUDE_DEG);
      expect(result.isNight).toBe(true);
    });

    // Red if the sun still shines at night.
    it("has intensity 0", () => {
      expect(result.intensity).toBe(0);
    });

    // Red if the flag flips on the wrong side: noon is never night, midnight always is.
    it("separates day and night on the altitude threshold", () => {
      for (const time of [0, 2, 4, 22, 23.5]) expect(setup({ time, season: "winter" }).isNight).toBe(true);
      for (const time of [11, 12, 13]) expect(setup({ time, season: "summer" }).isNight).toBe(false);
    });
  });

  describe("sky params", () => {
    // Red if the sky sun position does not point towards the sun.
    it("points the sky sun position along the light direction", () => {
      const result = setup({ time: 16, season: "summer" });
      const sky = normalise(result.skyParams.sunPosition);
      result.direction.forEach((component, i) => expect(sky[i]).toBeCloseTo(component, 4));
    });

    // Red if sky parameters are missing or not finite numbers.
    it("provides finite sky parameters by day and by night", () => {
      for (const time of [0, 12.5]) {
        const { skyParams } = setup({ time, season: "summer" });
        for (const key of ["turbidity", "rayleigh", "mieCoefficient", "mieDirectionalG"] as const) {
          expect(Number.isFinite(skyParams[key]), `${key} @${time}`).toBe(true);
        }
        expect(skyParams.sunPosition).toHaveLength(3);
        expect(skyParams.sunPosition.every(Number.isFinite)).toBe(true);
      }
    });

    // Red if the night sky is the same as the day sky.
    it("differs between day and night", () => {
      expect(setup({ time: 0, season: "summer" }).skyParams).not.toEqual(setup({ time: 12.5, season: "summer" }).skyParams);
    });
  });
});

describe("exposureForSun", () => {
  const altitudes = [-30, -20, -10, -5, -0.83, 0, 5, 10, 20, 30, 45, 60, 75, 90];

  // Red if the exposure is zero, negative or NaN anywhere.
  it("is positive and finite for every altitude", () => {
    for (const altitude of altitudes) {
      const exposure = exposureForSun(altitude);
      expect(Number.isFinite(exposure), `${altitude}`).toBe(true);
      expect(exposure, `${altitude}`).toBeGreaterThan(0);
    }
  });

  // Red if a brighter sun ever gets more exposure than a dimmer one.
  it("never increases with the sun altitude", () => {
    for (let i = 1; i < altitudes.length; i += 1) {
      expect(exposureForSun(altitudes[i]!), `${altitudes[i - 1]} -> ${altitudes[i]}`).toBeLessThanOrEqual(exposureForSun(altitudes[i - 1]!) + 1e-12);
    }
  });

  // Red if the exposure is constant (night would be unreadable or noon blown out).
  it("rises at night compared to a sunny noon", () => {
    expect(exposureForSun(-30)).toBeGreaterThan(exposureForSun(60));
  });

  // Red if the exposure only reacts below the horizon (high sun must be exposed lower than a low sun).
  it("is strictly lower at high noon than at the horizon", () => {
    expect(exposureForSun(60)).toBeLessThan(exposureForSun(0));
  });
});

describe("lightingLevels", () => {
  // Finds the time (hours) on the seed day at which the sun is closest to the wanted altitude, on the rising branch.
  function sunAt(altitudeDeg: number, lighting: Partial<Lighting> = {}) {
    let best = setup({ time: 3, ...lighting });
    for (let time = 2; time <= 7; time += 0.002) {
      const candidate = setup({ time, ...lighting });
      if (Math.abs(candidate.altitudeDeg - altitudeDeg) < Math.abs(best.altitudeDeg - altitudeDeg)) best = candidate;
    }
    return best;
  }
  const noon = setup({ time: 12.5, season: "summer" });
  const night = setup({ time: 0, season: "summer" });
  const keys = ["sunIntensity", "environmentIntensity", "backgroundIntensity", "hemisphereIntensity"] as const;

  // Red if any level is negative, NaN or infinite at any time of the day.
  it("returns non-negative finite intensities for every hour of every season", () => {
    for (const season of ["winter", "spring", "summer", "autumn"] as const) {
      for (let time = 0; time < 24; time += 0.5) {
        const levels = lightingLevels(setup({ time, season }));
        for (const key of keys) {
          expect(Number.isFinite(levels[key]), `${key} ${season} ${time}`).toBe(true);
          expect(levels[key], `${key} ${season} ${time}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  // Red if the scene goes black at night (dim but readable).
  it("keeps environment and hemisphere light above 0 at night", () => {
    const levels = lightingLevels(night);
    expect(night.isNight).toBe(true);
    expect(levels.environmentIntensity).toBeGreaterThan(0);
    expect(levels.hemisphereIntensity).toBeGreaterThan(0);
  });

  // Red if the sun still lights the scene at night.
  it("has no sun light at night", () => {
    expect(lightingLevels(night).sunIntensity).toBe(0);
  });

  // Red if the day sun of the levels is detached from the sun setup (it may only be ramped down near the horizon, never boosted).
  it("derives the high-sun intensity from the sun setup", () => {
    const { sunIntensity } = lightingLevels(noon);
    expect(noon.altitudeDeg).toBeGreaterThan(40);
    expect(sunIntensity).toBeLessThanOrEqual(noon.intensity * (1 + 1e-9));
    expect(sunIntensity).toBeGreaterThanOrEqual(noon.intensity * 0.9);
  });

  // Red if the hemisphere colours are missing or not usable colours (a #rrggbb string or an [r, g, b] triple in 0..1).
  it.each([["noon", noon], ["night", night]])("returns usable hemisphere colours at %s", (_name, sun) => {
    const levels = lightingLevels(sun);
    for (const colour of [levels.hemisphereSkyColor, levels.hemisphereGroundColor] as unknown[]) {
      if (typeof colour === "string") {
        expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
      } else {
        expect(Array.isArray(colour)).toBe(true);
        expect(colour as number[]).toHaveLength(3);
        for (const channel of colour as number[]) {
          expect(Number.isFinite(channel)).toBe(true);
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  describe("continuity across the horizon (-1 degree vs +1 degree)", () => {
    const below = sunAt(-1);
    const above = sunAt(1);

    it("compares setups that really are on both sides of the horizon", () => {
      expect(below.altitudeDeg).toBeCloseTo(-1, 1);
      expect(above.altitudeDeg).toBeCloseTo(1, 1);
    });

    // Red if environment, background or hemisphere jump: each may change by at most 50 % of the larger value.
    it.each(["environmentIntensity", "backgroundIntensity", "hemisphereIntensity"] as const)("changes %s by at most half of the larger value", (key) => {
      const a = lightingLevels(below)[key];
      const b = lightingLevels(above)[key];
      expect(Math.abs(a - b)).toBeLessThanOrEqual(0.5 * Math.max(a, b));
    });

    // Red if the sun light switches on with a step: its change across the horizon stays within 25 % of its noon value.
    it("changes the sun intensity by at most a quarter of its noon value", () => {
      const step = Math.abs(lightingLevels(above).sunIntensity - lightingLevels(below).sunIntensity);
      expect(step).toBeLessThanOrEqual(0.25 * lightingLevels(noon).sunIntensity);
    });
  });
});
