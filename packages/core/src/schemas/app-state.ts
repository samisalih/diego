import { z } from "zod";
import { idSchema } from "../ids.ts";
import { vec3Schema } from "./common.ts";

export const appStateSchema = z.object({
  mode: z.enum(["editor", "documents", "workshop"]),
  activeDocumentId: idSchema("doc").nullable(),
  activeAssetId: idSchema("asset").nullable(),
  editorView: z.enum(["dollhouse", "firstPerson"]),
  renderMode: z.enum(["work", "photo"]),
  photoResolution: z.object({ width: z.number(), height: z.number() }),
  camera: z.object({
    position: vec3Schema,
    target: vec3Schema,
    focalLength: z.number().min(10).max(200),
  }).nullable(),
  focusId: z.string().nullable(),
  selection: z.array(z.string()),
  workshopCamera: z.enum(["front", "side", "top", "perspective"]),
  workshopLight: z.enum(["studio", "apartment"]),
  measurementOverlay: z.array(z.object({ from: vec3Schema, to: vec3Schema })),
  aiBusyUntil: z.string().nullable(),
});
export type AppState = z.infer<typeof appStateSchema>;
