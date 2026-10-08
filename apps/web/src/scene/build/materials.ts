import type { Material } from "@app/core";

/** Plain PBR values for a three.js material; `color` is linear RGB. */
export type MaterialParams = { color: [number, number, number]; roughness: number; metalness: number };

const NEUTRAL_COLOR = "#c8c4bc";
const NEUTRAL_ROUGHNESS = 0.8;

function hexToSrgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255) as [number, number, number];
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function resolveSrgbColor(material: Material): [number, number, number] {
  const base = hexToSrgb(material.fallbackColor);
  if (!material.tint) return base;
  const tint = hexToSrgb(material.tint);
  return base.map((channel, index) => channel * tint[index]!) as [number, number, number];
}

/** Scalar PBR values of a material row; a missing material renders as neutral light grey. */
export function materialParams(material: Material | null | undefined): MaterialParams {
  if (!material) {
    return { color: hexToSrgb(NEUTRAL_COLOR).map(srgbToLinear) as MaterialParams["color"], roughness: NEUTRAL_ROUGHNESS, metalness: 0 };
  }
  return {
    color: resolveSrgbColor(material).map(srgbToLinear) as MaterialParams["color"],
    roughness: Math.min(Math.max(material.roughnessFactor, 0), 1),
    metalness: material.metalnessFactor ?? 0,
  };
}

/** Transmission material values for window and balcony door panes. */
export function glassParams(): { transmission: number; roughness: number; ior: number; thickness: number } {
  return { transmission: 1, roughness: 0.05, ior: 1.5, thickness: 0.01 };
}
