import { sunLight, sunPosition, type ApartmentMeta, type Lighting } from "@app/core";
import { SEED_DOCUMENT } from "../../../packages/core/src/seed/index.ts";
import { describe, expect, it } from "vitest";
import { exposureForSun, sunSetup } from "../src/scene/build/sun.ts";

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
      expect(exposureForSun(altitudes[i]), `${altitudes[i - 1]} -> ${altitudes[i]}`).toBeLessThanOrEqual(exposureForSun(altitudes[i - 1]) + 1e-12);
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
