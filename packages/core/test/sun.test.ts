import { describe, expect, it } from "vitest";
import {
  SEASON_DATES,
  goldenHourTime,
  localTimeToDate,
  sunLight,
  sunPosition,
} from "../src/sun.ts";

// Reference values: independent computation with the NOAA / Meeus low-precision solar position
// formulas (declination, equation of time, hour angle) for Berlin (52.52 N, 13.405 E), year 2026.
//   15 Jul: declination ~21.4 deg, solar noon ~13:12 CEST, noon altitude ~59.0 deg
//   15 Jan: declination ~-21.2 deg, solar noon ~12:15 CET, noon altitude ~16.3 deg
//   15 Jul 07:00 CEST: altitude ~15 deg, azimuth ~74 deg; 23:00 CEST: altitude ~-11 deg
//   2 deg evening altitude: 15 Jul ~20.99 h, 15 Jan ~15.98 h (local time)
const BERLIN = { latitude: 52.52, longitude: 13.405, timeZone: "Europe/Berlin", year: 2026 };
const summer = { ...BERLIN, season: "summer" as const, northAngle: 0 };
const winter = { ...BERLIN, season: "winter" as const, northAngle: 0 };

describe("SEASON_DATES", () => {
  // Red if any month/day pair changes.
  it("maps each season to its [month, day] pair", () => {
    expect(SEASON_DATES).toEqual({
      winter: [1, 15],
      spring: [4, 15],
      summer: [7, 15],
      autumn: [10, 15],
    });
  });
});

describe("localTimeToDate", () => {
  // Red if the zone offset is ignored.
  it("converts winter wall-clock time (CET, UTC+1)", () => {
    const date = localTimeToDate({ year: 2026, month: 1, day: 15, hours: 12, timeZone: "Europe/Berlin" });
    expect(date.toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });

  // Red if DST is not applied (would give 11:00Z).
  it("converts summer wall-clock time (CEST, UTC+2)", () => {
    const date = localTimeToDate({ year: 2026, month: 7, day: 15, hours: 12, timeZone: "Europe/Berlin" });
    expect(date.toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });

  // Red if fractional hours are truncated.
  it("handles fractional hours", () => {
    const date = localTimeToDate({ year: 2026, month: 7, day: 15, hours: 7.5, timeZone: "Europe/Berlin" });
    expect(date.toISOString()).toBe("2026-07-15T05:30:00.000Z");
  });

  // Red if the zone is hard-coded to Berlin.
  it("respects a different zone (UTC has no offset)", () => {
    const date = localTimeToDate({ year: 2026, month: 7, day: 15, hours: 12, timeZone: "UTC" });
    expect(date.toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });
});

describe("sunPosition", () => {
  // Red if altitude is in radians, or the wrong date/season is used.
  it("summer solar noon altitude is about 59 degrees", () => {
    const pos = sunPosition({ ...summer, time: 13.2 });
    expect(pos.altitudeDeg).toBeGreaterThan(57.5);
    expect(pos.altitudeDeg).toBeLessThan(60.5);
  });

  // Red if the season is ignored (summer and winter would match).
  it("winter solar noon altitude is about 16 degrees", () => {
    const pos = sunPosition({ ...winter, time: 12.25 });
    expect(pos.altitudeDeg).toBeGreaterThan(14.8);
    expect(pos.altitudeDeg).toBeLessThan(17.8);
  });

  // Red if time is treated as UTC instead of local wall-clock (sun would be ~2 h off).
  it("sun is well below the horizon at 23:00 local in summer", () => {
    const pos = sunPosition({ ...summer, time: 23 });
    expect(pos.altitudeDeg).toBeLessThan(-5);
  });

  // Red if azimuth is measured from south or counter-clockwise.
  it("azimuth is near 180 (south) around solar noon in summer", () => {
    const pos = sunPosition({ ...summer, time: 13.2 });
    expect(Math.abs(pos.azimuthDeg - 180)).toBeLessThan(5);
  });

  // Red if the azimuth convention of suncalc (from south) is not converted.
  it("azimuth is in the east in the morning and in the west in the evening", () => {
    const morning = sunPosition({ ...summer, time: 7 });
    const evening = sunPosition({ ...summer, time: 19 });
    expect(morning.altitudeDeg).toBeGreaterThan(0);
    expect(morning.azimuthDeg).toBeGreaterThan(55);
    expect(morning.azimuthDeg).toBeLessThan(110);
    expect(evening.azimuthDeg).toBeGreaterThan(250);
    expect(evening.azimuthDeg).toBeLessThan(305);
  });

  // Red if direction is not normalised.
  it("direction is a unit vector", () => {
    for (const time of [4, 7, 13.2, 19, 23]) {
      const { direction } = sunPosition({ ...summer, time, northAngle: 37 });
      const [x, y, z] = direction;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
    }
  });

  // Red if the vertical component uses the wrong sign or is not sin(altitude).
  it("direction y is positive iff altitude is positive and equals sin(altitude)", () => {
    for (const time of [4, 7, 13.2, 19, 23]) {
      const pos = sunPosition({ ...summer, time });
      expect(pos.direction[1] > 0).toBe(pos.altitudeDeg > 0);
      expect(pos.direction[1]).toBeCloseTo(Math.sin((pos.altitudeDeg * Math.PI) / 180), 6);
    }
  });

  // Derivation: n = 0 -> N = (0,0,-1), E = (1,0,0). South sun (az 180): cos(az) = -1, sin(az) = 0,
  // so direction = cos(alt) * (-N) + sin(alt) * up = (0, sin(alt), cos(alt)) -> +z.
  // Red if the north vector is mixed up with the south vector.
  it("with northAngle 0 a south sun points to +z", () => {
    const pos = sunPosition({ ...summer, time: 13.2, northAngle: 0 });
    const [x, , z] = pos.direction;
    expect(z).toBeGreaterThan(0.45);
    expect(Math.abs(x)).toBeLessThan(0.1 * z);
  });

  // Derivation: n = 90 deg -> N = (1,0,0), E = (0,0,1). South sun: direction = -cos(alt) * N -> -x.
  // Red if northAngle is not applied or rotates the wrong way.
  it("with northAngle 90 the same south sun points to -x", () => {
    const pos = sunPosition({ ...summer, time: 13.2, northAngle: 90 });
    const [x, , z] = pos.direction;
    expect(x).toBeLessThan(-0.45);
    expect(Math.abs(z)).toBeLessThan(0.1 * Math.abs(x));
  });

  // Red if northAngle changes altitude or azimuth (it must only rotate the scene vector).
  it("northAngle does not change altitude or azimuth", () => {
    const a = sunPosition({ ...summer, time: 10, northAngle: 0 });
    const b = sunPosition({ ...summer, time: 10, northAngle: 123 });
    expect(b.altitudeDeg).toBeCloseTo(a.altitudeDeg, 6);
    expect(b.azimuthDeg).toBeCloseTo(a.azimuthDeg, 6);
  });
});

// Berlin always has a 2 degree crossing; a null here is a test failure, not a skipped case.
function goldenHourOf(location: Parameters<typeof goldenHourTime>[0]): number {
  const hours = goldenHourTime(location);
  expect(hours).not.toBeNull();
  return hours as number;
}

describe("goldenHourTime", () => {
  // Red if the winter date is used for summer (or vice versa).
  it("is later in summer than in winter", () => {
    const s = goldenHourOf({ ...BERLIN, season: "summer" });
    const w = goldenHourOf({ ...BERLIN, season: "winter" });
    expect(s).toBeGreaterThan(w);
  });

  // Red if the target altitude is not 2 degrees or the result is in the wrong unit.
  it.each(["summer", "winter"] as const)("sun altitude is about 2 degrees in the evening (%s)", (season) => {
    const hours = goldenHourOf({ ...BERLIN, season });
    expect(hours).toBeGreaterThan(15);
    expect(hours).toBeLessThan(24);
    const pos = sunPosition({ ...BERLIN, season, northAngle: 0, time: hours });
    expect(Math.abs(pos.altitudeDeg - 2)).toBeLessThan(0.5);
  });

  // Red if the morning crossing is returned instead of the evening one.
  it("matches the reference evening times within 15 minutes", () => {
    expect(Math.abs(goldenHourOf({ ...BERLIN, season: "summer" }) - 20.99)).toBeLessThan(0.25);
    expect(Math.abs(goldenHourOf({ ...BERLIN, season: "winter" }) - 15.98)).toBeLessThan(0.25);
  });
});

describe("sunLight", () => {
  // Red if the threshold is wrong or night light is not zeroed.
  it.each([-0.84, -5, -30, -90])("is dark below the horizon threshold (%s deg)", (alt) => {
    expect(sunLight(alt).illuminanceLux).toBe(0);
  });

  // Red if the sun just above -0.83 deg yields no light.
  it("gives light at the horizon", () => {
    expect(sunLight(0).illuminanceLux).toBeGreaterThan(0);
  });

  // Red if the air-mass model is not monotonic.
  it("illuminance is monotonically non-decreasing with altitude", () => {
    let previous = -1;
    for (let alt = -1; alt <= 90; alt += 1) {
      const lux = sunLight(alt).illuminanceLux;
      expect(lux).toBeGreaterThanOrEqual(previous);
      previous = lux;
    }
    expect(sunLight(30).illuminanceLux).toBeGreaterThan(sunLight(5).illuminanceLux);
  });

  // Red if the high-sun level is far off ~100 000 lx.
  it("is roughly 100000 lux at 60 degrees and above", () => {
    const lux = sunLight(60).illuminanceLux;
    expect(lux).toBeGreaterThan(80_000);
    expect(lux).toBeLessThan(130_000);
  });

  // Red if the colour does not warm toward the horizon.
  it("is warm (r > b) near the horizon", () => {
    const [r, , b] = sunLight(1).color;
    expect(r).toBeGreaterThan(b);
    expect(r - b).toBeGreaterThan(0.3);
  });

  // Red if the high sun stays warm (5800 K is near neutral).
  it("is near neutral at high altitude", () => {
    const [r, g, b] = sunLight(60).color;
    for (const c of [r, g, b]) {
      expect(c).toBeGreaterThan(0.85);
      expect(c).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(r - b)).toBeLessThan(0.15);
  });

  // Red if colour components leave 0..1.
  it("colour components stay within 0..1", () => {
    for (let alt = -1; alt <= 90; alt += 5) {
      for (const c of sunLight(alt).color) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("goldenHourTime without a 2 degree crossing", () => {
  const ARCTIC = { latitude: 80, longitude: 15, timeZone: "UTC", year: 2026 };

  // Red if a bogus time is returned when the sun stays below 2 degrees all day.
  it("returns null during polar night", () => {
    expect(goldenHourTime({ ...ARCTIC, season: "winter" })).toBeNull();
  });

  // Red if a bogus time is returned when the sun stays above 2 degrees all day.
  it("returns null during polar day", () => {
    expect(goldenHourTime({ ...ARCTIC, season: "summer" })).toBeNull();
  });
});
