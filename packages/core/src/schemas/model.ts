import { z } from "zod";
import { idSchema } from "../ids.ts";
import { vec3Schema } from "./common.ts";

export const boundingBoxSchema = z.object({ min: vec3Schema, max: vec3Schema });
export type BoundingBox = z.infer<typeof boundingBoxSchema>;

export const modelSchema = z.object({
  id: idSchema("model"),
  name: z.string(),
  source: z.enum(["upload", "polyhaven", "url"]),
  sourceId: z.string().nullish(),
  license: z.string().nullish(),
  storagePath: z.string(),
  boundingBox: boundingBoxSchema,
});
export type Model = z.infer<typeof modelSchema>;
