import { z } from "zod";
import { MAX_FORMULA_LENGTH } from "../formula/evaluate.ts";

// A number, or a formula string such as "=width / 2".
export const numberOrFormulaSchema = z.union([z.number(), z.string().startsWith("=").max(MAX_FORMULA_LENGTH)]);
export type NumberOrFormula = z.infer<typeof numberOrFormulaSchema>;

export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3Tuple = z.infer<typeof vec3Schema>;

// Tolerance for comparing sums of metre values that went through floating point arithmetic.
export const EPSILON = 1e-9;

// Reports every entry whose value already appeared earlier in the list.
export function reportDuplicates(
  ctx: z.core.$RefinementCtx,
  listName: string,
  entries: { [key: string]: unknown }[],
  key: string,
): void {
  const seen = new Set<unknown>();
  entries.forEach((entry, index) => {
    if (seen.has(entry[key])) {
      ctx.addIssue({ code: "custom", path: [listName, index, key], message: `Duplicate ${key} "${String(entry[key])}"` });
    }
    seen.add(entry[key]);
  });
}
