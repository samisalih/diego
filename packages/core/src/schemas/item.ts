import { z } from "zod";
import { idSchema } from "../ids.ts";

export const itemSchema = z.object({
  id: idSchema("item"),
  assetId: idSchema("asset"),
  name: z.string().nullish(),
  x: z.number(),
  z: z.number(),
  rotation: z.number().min(0).lt(360),
  params: z.record(z.string(), z.number()),
  locked: z.boolean(),
  hidden: z.boolean(),
  lightOn: z.boolean(),
  clampedParams: z.array(z.string()).optional(),
});
export type Item = z.infer<typeof itemSchema>;
