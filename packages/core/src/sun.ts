import { getPosition } from "suncalc";
import { kelvinToRgb } from "./lighting.ts";

export const SEASONS = ["winter", "spring", "summer", "autumn"] as const;
export type Season = (typeof SEASONS)[number];

// [month, day] of the representative day of each season.
export const SEASON_DATES: Record<Season, [number, number]> = {
  winter: [1, 15],
  spring: [4, 15],
  summer: [7, 15],
  autumn: [10, 15],
};

export type Vec3 = [number, number, number];

export interface SunLocation {
  season: Season;
  latitude: number;
  longitude: number;
  timeZone: string;
  year: number;
}

export interface SunPositionInput extends SunLocation {
  /** Local wall-clock hours (decimal) on the season's date. */
  time: number;
  /** Rotation of north in the scene, degrees. */
  northAngle: number;
}

export interface SunPosition {
  altitudeDeg: number;
  azimuthDeg: number;
  direction: Vec3;
}

const MS_PER_HOUR = 3_600_000;
const GOLDEN_HOUR_ALTITUDE_DEG = 2;
const HORIZON_ALTITUDE_DEG = -0.83;
const HORIZON_KELVIN = 2000;
const HIGH_SUN_KELVIN = 5800;
const HIGH_SUN_ALTITUDE_DEG = 40;
const CLEAR_SKY_LUX = 133_000;
const BISECTION_TOLERANCE_HOURS = 1 / 120;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function getZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  const wallClockAsUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function localTimeToDate(input: { year: number; month: number; day: number; hours: number; timeZone: string }): Date {
  const { year, month, day, hours, timeZone } = input;
  const wallClockAsUtc = Date.UTC(year, month - 1, day) + hours * MS_PER_HOUR;
  // Two passes settle the offset when the first guess lands on the other side of a DST switch.
  const firstGuess = wallClockAsUtc - getZoneOffsetMs(new Date(wallClockAsUtc), timeZone);
  return new Date(wallClockAsUtc - getZoneOffsetMs(new Date(firstGuess), timeZone));
}

function getSeasonDate(location: SunLocation, hours: number): Date {
  const [month, day] = SEASON_DATES[location.season];
  return localTimeToDate({ year: location.year, month, day, hours, timeZone: location.timeZone });
}

export function sunPosition(input: SunPositionInput): SunPosition {
  const { altitude, azimuth } = getPosition(getSeasonDate(input, input.time), input.latitude, input.longitude);
  const alt = toRadians(altitude);
  const az = toRadians(azimuth);
  const north = toRadians(input.northAngle);
  const horizontal = Math.cos(alt);
  // direction = cos(alt) * (cos(az) * N + sin(az) * E) + sin(alt) * up, with N = (sin n, 0, -cos n), E = (cos n, 0, sin n)
  const direction: Vec3 = [
    horizontal * (Math.cos(az) * Math.sin(north) + Math.sin(az) * Math.cos(north)),
    Math.sin(alt),
    horizontal * (-Math.cos(az) * Math.cos(north) + Math.sin(az) * Math.sin(north)),
  ];
  return { altitudeDeg: altitude, azimuthDeg: azimuth, direction };
}

/** Local hours at which the evening sun descends through 2 degrees altitude. */
export function goldenHourTime(location: SunLocation): number {
  const altitudeAt = (hours: number): number =>
    getPosition(getSeasonDate(location, hours), location.latitude, location.longitude).altitude;
  // Invariant: the sun is above the target at `above` (noon) and below it at `below` (midnight).
  let above = 12;
  let below = 24;
  while (below - above > BISECTION_TOLERANCE_HOURS) {
    const middle = (above + below) / 2;
    if (altitudeAt(middle) > GOLDEN_HOUR_ALTITUDE_DEG) above = middle;
    else below = middle;
  }
  return (above + below) / 2;
}

export function sunLight(altitudeDeg: number): { color: Vec3; illuminanceLux: number } {
  if (altitudeDeg < HORIZON_ALTITUDE_DEG) return { color: kelvinToRgb(HORIZON_KELVIN), illuminanceLux: 0 };
  const altitude = Math.max(altitudeDeg, 0);
  const warmth = Math.min(altitude / HIGH_SUN_ALTITUDE_DEG, 1);
  const kelvin = HORIZON_KELVIN + (HIGH_SUN_KELVIN - HORIZON_KELVIN) * warmth;
  // Kasten-Young air mass, then Meinel-style atmospheric attenuation.
  const airMass = 1 / (Math.sin(toRadians(altitude)) + 0.50572 * (altitude + 6.07995) ** -1.6364);
  const illuminanceLux = CLEAR_SKY_LUX * 0.7 ** airMass ** 0.678;
  return { color: kelvinToRgb(kelvin), illuminanceLux };
}
