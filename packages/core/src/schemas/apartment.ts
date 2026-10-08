import { z } from "zod";
import { wallLength } from "../geometry/polygon.ts";
import { idSchema } from "../ids.ts";
import { EPSILON, reportDuplicates } from "./common.ts";

const DEFAULT_TIME_ZONE = "Europe/Berlin";
const MIN_WALL_LENGTH = 0.05;
const MAX_DOOR_SILL_HEIGHT = 0.05;

function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export const apartmentMetaSchema = z.object({
  name: z.string().min(1).max(120),
  ceilingHeight: z.number().min(2).max(5),
  northAngle: z.number().min(0).lt(360),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180).default(10),
  timeZone: z.string().refine(isKnownTimeZone, "Unknown IANA time zone").default(DEFAULT_TIME_ZONE),
});
export type ApartmentMeta = z.infer<typeof apartmentMetaSchema>;

const point2Schema = z.tuple([z.number(), z.number()]);

export const roomSchema = z.object({
  id: idSchema("room"),
  name: z.string().min(1).max(80),
  polygon: z.array(point2Schema).min(3),
  floorMaterialId: idSchema("mat").nullish(),
  wallMaterialId: idSchema("mat").nullish(),
  ceilingMaterialId: idSchema("mat").nullish(),
  estimated: z.boolean().optional(),
}).refine(
  ({ polygon }) => {
    const first = polygon[0];
    const last = polygon[polygon.length - 1];
    return !first || !last || polygon.length < 2 || first[0] !== last[0] || first[1] !== last[1];
  },
  { message: "The last polygon point must not repeat the first", path: ["polygon"] },
);
export type Room = z.infer<typeof roomSchema>;

export const ROOM_MATERIAL_FIELDS = ["floorMaterialId", "wallMaterialId", "ceilingMaterialId"] as const;
export const OPENING_MATERIAL_FIELDS = ["frameMaterialId"] as const;

export const wallSchema = z.object({
  id: idSchema("wall"),
  startX: z.number(),
  startZ: z.number(),
  endX: z.number(),
  endZ: z.number(),
  thickness: z.number().min(0.05).max(1),
  exterior: z.boolean(),
  estimated: z.boolean().optional(),
}).refine((wall) => wallLength(wall) > MIN_WALL_LENGTH + EPSILON, {
  message: `Wall length must be greater than ${MIN_WALL_LENGTH} m`,
});
export type Wall = z.infer<typeof wallSchema>;

export const OPENING_TYPES = ["window", "door", "balconyDoor"] as const;

export const openingSchema = z.object({
  id: idSchema("opening"),
  wallId: idSchema("wall"),
  type: z.enum(OPENING_TYPES),
  offsetFromStart: z.number().min(0),
  width: z.number().min(0.2).max(5),
  height: z.number().min(0.2).max(3),
  sillHeight: z.number().min(0).max(2.5),
  frameMaterialId: idSchema("mat").nullish(),
  estimated: z.boolean().optional(),
}).refine((opening) => opening.type === "window" || opening.sillHeight <= MAX_DOOR_SILL_HEIGHT, {
  message: `Doors need a sill height between 0 and ${MAX_DOOR_SILL_HEIGHT} m`,
  path: ["sillHeight"],
});
export type Opening = z.infer<typeof openingSchema>;

export const apartmentSchema = z.object({
  meta: apartmentMetaSchema,
  rooms: z.array(roomSchema),
  walls: z.array(wallSchema),
  openings: z.array(openingSchema),
}).superRefine((apartment, ctx) => {
  reportDuplicates(ctx, "rooms", apartment.rooms, "id");
  reportDuplicates(ctx, "walls", apartment.walls, "id");
  reportDuplicates(ctx, "openings", apartment.openings, "id");

  const wallsById = new Map(apartment.walls.map((wall) => [wall.id, wall]));
  apartment.openings.forEach((opening, index) => {
    const wall = wallsById.get(opening.wallId);
    if (!wall) {
      ctx.addIssue({ code: "custom", path: ["openings", index, "wallId"], message: `Wall "${opening.wallId}" does not exist` });
    } else if (opening.offsetFromStart + opening.width > wallLength(wall) + EPSILON) {
      ctx.addIssue({ code: "custom", path: ["openings", index, "width"], message: "Opening extends beyond the end of its wall" });
    }
    if (opening.sillHeight + opening.height > apartment.meta.ceilingHeight + EPSILON) {
      ctx.addIssue({ code: "custom", path: ["openings", index, "height"], message: "Opening is higher than the ceiling" });
    }
  });
});
export type Apartment = z.infer<typeof apartmentSchema>;
