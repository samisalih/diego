import { z } from "zod";
import { idSchema } from "../ids.ts";
import { numberOrFormulaSchema, reportDuplicates } from "./common.ts";

const RESERVED_PARAM_KEYS = ["i", "count", "pi"];
const MIN_LATHE_PROFILE_POINTS = 2;
const MIN_EXTRUDE_PROFILE_POINTS = 3;

export const PARAM_UNITS = ["m", "deg", "count", "factor"] as const;

export const assetParamSchema = z.object({
  key: z.string()
    .regex(/^[a-z][a-zA-Z0-9]*$/)
    .refine((key) => !RESERVED_PARAM_KEYS.includes(key), "Reserved name, used as a formula variable"),
  label: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  default: z.number(),
  unit: z.enum(PARAM_UNITS),
}).superRefine((param, ctx) => {
  if (param.min >= param.max) {
    ctx.addIssue({ code: "custom", path: ["max"], message: "max must be greater than min" });
  }
  if (param.default < param.min || param.default > param.max) {
    ctx.addIssue({ code: "custom", path: ["default"], message: "default must lie between min and max" });
  }
});
export type AssetParam = z.infer<typeof assetParamSchema>;

export const PART_SHAPES = [
  "box", "cylinder", "sphere", "capsule", "torus", "plane", "cushion", "lathe", "extrude", "model",
] as const;
export type PartShape = (typeof PART_SHAPES)[number];

const profileSchema = z.array(z.tuple([numberOrFormulaSchema, numberOrFormulaSchema]));

export const partSchema = z.object({
  id: idSchema("part"),
  name: z.string(),
  shape: z.enum(PART_SHAPES),
  x: numberOrFormulaSchema,
  y: numberOrFormulaSchema,
  z: numberOrFormulaSchema,
  rx: numberOrFormulaSchema.default(0),
  ry: numberOrFormulaSchema.default(0),
  rz: numberOrFormulaSchema.default(0),
  w: numberOrFormulaSchema,
  h: numberOrFormulaSchema,
  d: numberOrFormulaSchema,
  bevel: numberOrFormulaSchema.default(0),
  materialId: idSchema("mat").nullish(),
  repeat: z.object({ count: numberOrFormulaSchema }).nullish(),
  light: z.object({
    lumens: numberOrFormulaSchema,
    kelvin: numberOrFormulaSchema,
    type: z.enum(["point", "spot", "area"]),
  }).nullish(),
  fill: numberOrFormulaSchema.optional(),
  tube: numberOrFormulaSchema.optional(),
  profile: profileSchema.optional(),
  modelId: idSchema("model").nullish(),
  scaleMode: z.enum(["uniform", "stretch", "fit"]).optional(),
}).superRefine((part, ctx) => {
  const minProfilePoints = { lathe: MIN_LATHE_PROFILE_POINTS, extrude: MIN_EXTRUDE_PROFILE_POINTS }[part.shape as string];
  if (minProfilePoints !== undefined && (part.profile?.length ?? 0) < minProfilePoints) {
    ctx.addIssue({
      code: "custom",
      path: ["profile"],
      message: `A ${part.shape} part needs a profile with at least ${minProfilePoints} points`,
    });
  }
  if (part.shape === "model" && !part.modelId) {
    ctx.addIssue({ code: "custom", path: ["modelId"], message: "A model part needs a modelId" });
  }
}).transform((part) => (part.shape === "model" ? { ...part, scaleMode: part.scaleMode ?? "fit" } : part));
export type Part = z.infer<typeof partSchema>;

const referenceImageSchema = z.object({
  path: z.string(),
  opacity: z.number().min(0).max(1),
  calibration: z.object({
    a: z.tuple([z.number(), z.number()]),
    b: z.tuple([z.number(), z.number()]),
    lengthM: z.number(),
  }).nullish(),
});
export type ReferenceImage = z.infer<typeof referenceImageSchema>;

export const assetSchema = z.object({
  id: idSchema("asset"),
  name: z.string(),
  category: z.string(),
  params: z.array(assetParamSchema),
  parts: z.array(partSchema),
  referenceImages: z.object({
    front: referenceImageSchema.optional(),
    side: referenceImageSchema.optional(),
    top: referenceImageSchema.optional(),
  }),
}).superRefine((asset, ctx) => {
  reportDuplicates(ctx, "params", asset.params, "key");
  reportDuplicates(ctx, "parts", asset.parts, "id");
});
export type Asset = z.infer<typeof assetSchema>;
