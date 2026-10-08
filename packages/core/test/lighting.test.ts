import { describe, expect, it } from "vitest";
import {
  LIGHTING_PRESETS,
  PRESET_IDS,
  lumensToCandela,
  resolvePresetTime,
} from "../src/lighting.ts";
import { kelvinToRgb } from "../src/color.ts";
import { goldenHourTime } from "../src/sun.ts";

const LOCATION = { latitude: 52.52, longitude: 13.405, timeZone: "Europe/Berlin", year: 2026 };

describe("kelvinToRgb", () => {
  // Red if the Tanner Helland curve is replaced by something not white at 6500 K.
  it("6500 K is approximately white", () => {
    for (const c of kelvinToRgb(6500)) {
      expect(c).toBeGreaterThan(0.95);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  // Red if low temperatures do not shift to red/orange.
  it("2700 K is warm: r > g > b with little blue", () => {
    const [r, g, b] = kelvinToRgb(2700);
    expect(r).toBeGreaterThan(0.95);
    expect(g).toBeLessThan(r);
    expect(g).toBeGreaterThan(b);
    expect(b).toBeLessThan(0.5);
  });

  // Red if high temperatures do not shift to blue.
  it("10000 K is cool: b > r", () => {
    const [r, , b] = kelvinToRgb(10000);
    expect(b).toBeGreaterThan(r);
  });

  // Red if the lower clamp is missing (500 K must behave like 1000 K).
  it("clamps below 1000 K", () => {
    expect(kelvinToRgb(500)).toEqual(kelvinToRgb(1000));
  });

  // Red if the upper clamp is missing (100000 K must behave like 40000 K).
  it("clamps above 40000 K", () => {
    expect(kelvinToRgb(100000)).toEqual(kelvinToRgb(40000));
  });

  // Red if any component leaves 0..1.
  it("keeps all components within 0..1 across the range", () => {
    for (let k = 0; k <= 50000; k += 500) {
      for (const c of kelvinToRgb(k)) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("lumensToCandela", () => {
  // Red if 4*pi is replaced by 2*pi or pi.
  it("point: lm / 4pi", () => {
    expect(lumensToCandela(1000, "point")).toBeCloseTo(1000 / (4 * Math.PI), 6);
  });

  // Red if area is treated like a spot.
  it("area: lm / 4pi", () => {
    expect(lumensToCandela(1000, "area")).toBeCloseTo(1000 / (4 * Math.PI), 6);
  });

  // Red if the default spot angle is not 60 degrees.
  it("spot defaults to a 60 degree cone: lm / (2pi (1 - cos 30))", () => {
    const expected = 1000 / (2 * Math.PI * (1 - Math.cos(Math.PI / 6)));
    expect(lumensToCandela(1000, "spot")).toBeCloseTo(expected, 6);
    expect(lumensToCandela(1000, "spot")).toBeCloseTo(1187.9, 0);
  });

  // Red if the angle is used as half-angle or ignored.
  it("spot uses the given full angle (90 degrees)", () => {
    const expected = 1000 / (2 * Math.PI * (1 - Math.cos(Math.PI / 4)));
    expect(lumensToCandela(1000, "spot", 90)).toBeCloseTo(expected, 6);
  });

  // Red if candela does not scale linearly with lumens.
  it("scales linearly with lumens", () => {
    expect(lumensToCandela(2000, "spot", 45)).toBeCloseTo(2 * lumensToCandela(1000, "spot", 45), 6);
  });
});

describe("PRESET_IDS", () => {
  // Red if an id is renamed, added, removed or reordered.
  it("lists the five presets in order", () => {
    expect([...PRESET_IDS]).toEqual(["morningCoffee", "noon", "goldenHour", "cozyEvening", "movieNight"]);
  });
});

describe("LIGHTING_PRESETS", () => {
  // Red if a preset is missing or an extra one exists.
  it("has exactly one entry per preset id", () => {
    expect(Object.keys(LIGHTING_PRESETS).sort()).toEqual([...PRESET_IDS].sort());
  });

  // Red if a field is missing or a mood strength leaves 0..1.
  it.each([...PRESET_IDS])("%s has the documented shape", (id) => {
    const preset = LIGHTING_PRESETS[id];
    expect(typeof preset.effectsEnabled).toBe("boolean");
    expect(Object.keys(preset.mood).sort()).toEqual(["grain", "halftone", "lightLeak", "vignette"]);
    for (const value of Object.values(preset.mood)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(preset.time === "goldenHour" || typeof preset.time === "number").toBe(true);
  });

  // Red if any preset time changes.
  it("has the specified times", () => {
    expect(LIGHTING_PRESETS.morningCoffee.time).toBe(7.5);
    expect(LIGHTING_PRESETS.noon.time).toBe(12.5);
    expect(LIGHTING_PRESETS.goldenHour.time).toBe("goldenHour");
    expect(LIGHTING_PRESETS.cozyEvening.time).toBe(20);
    expect(LIGHTING_PRESETS.movieNight.time).toBe(21.5);
  });
});

describe("resolvePresetTime", () => {
  const summer = { ...LOCATION, season: "summer" as const };
  const winter = { ...LOCATION, season: "winter" as const };

  // Red if fixed times are not passed through.
  it("returns the fixed time of non-goldenHour presets", () => {
    expect(resolvePresetTime("morningCoffee", summer)).toBe(7.5);
    expect(resolvePresetTime("noon", summer)).toBe(12.5);
    expect(resolvePresetTime("cozyEvening", winter)).toBe(20);
    expect(resolvePresetTime("movieNight", winter)).toBe(21.5);
  });

  // Red if goldenHour returns a constant or does not delegate to goldenHourTime.
  it("computes goldenHour via goldenHourTime for the location", () => {
    const summerHours = goldenHourTime(summer);
    const winterHours = goldenHourTime(winter);
    expect(summerHours).not.toBeNull();
    expect(winterHours).not.toBeNull();
    expect(resolvePresetTime("goldenHour", summer)).toBeCloseTo(summerHours as number, 6);
    expect(resolvePresetTime("goldenHour", winter)).toBeCloseTo(winterHours as number, 6);
    expect(resolvePresetTime("goldenHour", summer)).toBeGreaterThan(resolvePresetTime("goldenHour", winter));
  });
});
