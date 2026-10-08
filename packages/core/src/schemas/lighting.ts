import { z } from "zod";
import { PRESET_IDS } from "../lighting.ts";
import { SEASONS } from "../sun.ts";

export const lightingSchema = z.object({
  time: z.number().min(0).max(24),
  season: z.enum(SEASONS),
  effectsEnabled: z.boolean(),
  lampShadowsEnabled: z.boolean().default(false),
  presetId: z.enum(PRESET_IDS).nullish(),
});
export type Lighting = z.infer<typeof lightingSchema>;
