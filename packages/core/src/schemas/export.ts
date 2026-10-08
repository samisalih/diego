import { z } from "zod";
import { assetSchema } from "./asset.ts";
import { documentContentSchema } from "./document.ts";
import { materialSchema } from "./material.ts";
import { modelSchema } from "./model.ts";

export const exportBundleSchema = z.object({
  format: z.literal("apartment-planner"),
  version: z.literal(1),
  document: documentContentSchema,
  assets: z.array(assetSchema),
  materials: z.array(materialSchema),
  models: z.array(modelSchema),
});
export type ExportBundle = z.infer<typeof exportBundleSchema>;
