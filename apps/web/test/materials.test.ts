import { type Material } from "@app/core";
import { SEED_MATERIALS } from "../../../packages/core/src/seed/index.ts";
import { describe, expect, it } from "vitest";
import { glassParams, materialParams } from "../src/scene/build/materials.ts";

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexChannels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);

const base: Material = SEED_MATERIALS.find((material) => material.id === "mat_oak_floorboards")!;
const material = (overrides: Partial<Material>): Material => ({ ...base, tint: null, metalnessFactor: null, ...overrides });

describe("materialParams", () => {
  // Red if the colour is left in sRGB or the wrong source colour is used.
  it("converts the sRGB fallback colour to linear", () => {
    const { color } = materialParams(material({ fallbackColor: "#b58a5c" }));
    hexChannels("#b58a5c").forEach((channel, i) => expect(color[i]!).toBeCloseTo(srgbToLinear(channel), 5));
  });

  // Red if the tint is multiplied in linear space or ignored.
  it("multiplies the sRGB tint into the sRGB colour before converting to linear", () => {
    const { color } = materialParams(material({ fallbackColor: "#808080", tint: "#ff8000" }));
    const fallback = hexChannels("#808080");
    const tint = hexChannels("#ff8000");
    fallback.forEach((channel, i) => expect(color[i]!).toBeCloseTo(srgbToLinear(channel * tint[i]!), 5));
  });

  // Red if a null tint darkens the colour.
  it("ignores a null tint", () => {
    expect(materialParams(material({ tint: null })).color).toEqual(materialParams(material({ tint: undefined })).color);
  });

  // Red if roughness is not clamped to 0..1 (factor range in the schema is 0..2).
  it("clamps the roughness factor to 0..1", () => {
    expect(materialParams(material({ roughnessFactor: 1.6 })).roughness).toBe(1);
    expect(materialParams(material({ roughnessFactor: 0.35 })).roughness).toBeCloseTo(0.35, 6);
    expect(materialParams(material({ roughnessFactor: 0 })).roughness).toBe(0);
  });

  // Red if metalness defaults to something other than 0 or ignores the factor.
  it("takes the metalness factor and defaults to 0", () => {
    expect(materialParams(material({ metalnessFactor: null })).metalness).toBe(0);
    expect(materialParams(material({ metalnessFactor: 0.7 })).metalness).toBeCloseTo(0.7, 6);
  });

  // Red if the seed brass material loses its metalness.
  it("maps every seed material to values within range", () => {
    for (const seed of SEED_MATERIALS) {
      const params = materialParams(seed);
      expect(params.roughness).toBeGreaterThanOrEqual(0);
      expect(params.roughness).toBeLessThanOrEqual(1);
      params.color.forEach((channel) => {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      });
      expect(params.metalness).toBeCloseTo(seed.metalnessFactor ?? 0, 6);
    }
  });

  // Red if the neutral fallback differs from #c8c4bc / roughness 0.8 / metalness 0.
  it.each([["undefined", undefined], ["null", null]])("falls back to neutral light grey for a missing material (%s)", (_name, missing) => {
    const params = materialParams(missing as undefined);
    hexChannels("#c8c4bc").forEach((channel, i) => expect(params.color[i]).toBeCloseTo(srgbToLinear(channel), 5));
    expect(params.roughness).toBe(0.8);
    expect(params.metalness).toBe(0);
  });
});

describe("glassParams", () => {
  // Red if any of the glass constants deviates from the spec.
  it("returns the transmission material values for panes", () => {
    expect(glassParams()).toMatchObject({ transmission: 1, roughness: 0.05, ior: 1.5, thickness: 0.01 });
  });
});
