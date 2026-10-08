import { createWebPlatform } from "./web.ts";

export const platform = createWebPlatform(import.meta.env);
export type { Platform, PickedFile } from "./types.ts";
