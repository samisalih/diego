import { createWebPlatform } from "./web";

export const platform = createWebPlatform(import.meta.env);
export type { Platform, PickedFile } from "./types";
