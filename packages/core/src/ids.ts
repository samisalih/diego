import { z } from "zod";

export const ID_PREFIXES = ["doc", "item", "asset", "part", "mat", "model", "room", "wall", "opening"] as const;
export type IdPrefix = (typeof ID_PREFIXES)[number];

const BASE36_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
const GENERATED_BODY_LENGTH = 10;

const idPattern = (prefix: IdPrefix) => new RegExp(`^${prefix}_[a-z0-9][a-z0-9_-]{0,63}$`);

export function createId(prefix: IdPrefix): string {
  const randomBytes = globalThis.crypto.getRandomValues(new Uint8Array(GENERATED_BODY_LENGTH));
  const body = Array.from(randomBytes, (byte) => BASE36_DIGITS[byte % BASE36_DIGITS.length]).join("");
  return `${prefix}_${body}`;
}

export function isId(value: unknown, prefix: IdPrefix): boolean {
  return typeof value === "string" && idPattern(prefix).test(value);
}

export function idSchema(prefix: IdPrefix) {
  return z.string().regex(idPattern(prefix));
}
