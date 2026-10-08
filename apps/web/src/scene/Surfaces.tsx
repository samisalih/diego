import type { Material } from "@app/core";
import { glassParams, materialParams } from "./build/materials.ts";
import { useQualityLevel } from "./quality.ts";

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
    return <meshStandardMaterial color="#cfe3ee" roughness={roughness} transparent opacity={0.18} depthWrite={false} />;
  }
  return <meshPhysicalMaterial transmission={transmission} roughness={roughness} ior={ior} thickness={thickness} color="#ffffff" />;
}
