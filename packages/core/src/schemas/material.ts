import { z } from "zod";
import { idSchema } from "../ids.ts";
import { colorSchema } from "./common.ts";

export const materialMapsSchema = z.object({
  baseColor: z.string().optional(),
  normal: z.string().optional(),
  roughness: z.string().optional(),
  metalness: z.string().optional(),
  ao: z.string().optional(),
  displacement: z.string().optional(),
});
export type MaterialMaps = z.infer<typeof materialMapsSchema>;

export const materialSchema = z.object({
  id: idSchema("mat"),
  name: z.string(),
  source: z.enum(["polyhaven", "ambientcg", "photo"]),
  sourceId: z.string().nullish(),
  license: z.string(),
  sourceUrl: z.string().nullish(),
  maps: materialMapsSchema,
  importStatus: z.enum(["pending", "ready", "failed"]),
  tileSize: z.number().positive(),
  tint: colorSchema.nullish(),
  roughnessFactor: z.number().min(0).max(2).default(1),
  metalnessFactor: z.number().min(0).max(1).nullish(),
  fallbackColor: colorSchema,
});
export type Material = z.infer<typeof materialSchema>;
