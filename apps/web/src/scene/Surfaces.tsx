import type { Material } from "@app/core";
import { glassParams, materialParams } from "./build/materials.ts";
import { useQualityLevel } from "./quality.ts";

const PLAIN_GLASS_COLOR = "#cfe3ee";
const PLAIN_GLASS_OPACITY = 0.18;
const TRANSMISSION_GLASS_COLOR = "#ffffff";

/** A standard PBR material from a material row (scalar values only in phase b); a missing row renders neutral grey. */
export function SurfaceMaterial({ material }: { material: Material | undefined }) {
  const { color, roughness, metalness } = materialParams(material);
  return <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />;
}

/** Window glass: real transmission, or thin transparent glass at the lowest quality step. */
export function GlassMaterial() {
  const { hasTransmission } = useQualityLevel();
  const { transmission, roughness, ior, thickness } = glassParams();
  if (!hasTransmission) {
    return <meshStandardMaterial color={PLAIN_GLASS_COLOR} roughness={roughness} transparent opacity={PLAIN_GLASS_OPACITY} depthWrite={false} />;
  }
  return <meshPhysicalMaterial transmission={transmission} roughness={roughness} ior={ior} thickness={thickness} color={TRANSMISSION_GLASS_COLOR} />;
}
