import { z } from "zod";
import { idSchema } from "../ids.ts";
import { apartmentSchema } from "./apartment.ts";
import { reportDuplicates } from "./common.ts";
import { itemSchema } from "./item.ts";
import { lightingSchema } from "./lighting.ts";

export const documentContentSchema = z.object({
  name: z.string(),
  apartment: apartmentSchema,
  items: z.array(itemSchema),
  lighting: lightingSchema,
}).superRefine((content, ctx) => {
  reportDuplicates(ctx, "items", content.items, "id");
});
export type DocumentContent = z.infer<typeof documentContentSchema>;

export const documentSchema = documentContentSchema.extend({
  id: idSchema("doc"),
  source: z.enum(["user", "ai", "import"]),
});
export type Document = z.infer<typeof documentSchema>;
