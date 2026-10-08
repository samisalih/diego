import { OPENING_MATERIAL_FIELDS, ROOM_MATERIAL_FIELDS, type ApartmentMeta, type Opening, type Room, type Wall } from "../schemas/apartment.ts";
import { documentContentSchema, type DocumentContent } from "../schemas/document.ts";
import { fail, findUnknownIds, mergeByKey, validateResult, type OperationResult } from "./result.ts";

export interface ApartmentChanges {
  upsert?: {
    meta?: Partial<ApartmentMeta>;
    rooms?: (Partial<Room> & { id: string })[];
    walls?: (Partial<Wall> & { id: string })[];
    openings?: (Partial<Opening> & { id: string })[];
  };
  remove?: { rooms?: string[]; walls?: string[]; openings?: string[] };
}

function keepOthers<T extends { id: string }>(entries: T[], removedIds: string[]): T[] {
  return entries.filter((entry) => !removedIds.includes(entry.id));
}

export function upsertApartment(content: DocumentContent, changes: ApartmentChanges): OperationResult<DocumentContent> {
  const { apartment } = content;
  const upsert = changes.upsert ?? {};
  const remove = { rooms: [], walls: [], openings: [], ...changes.remove };

  const issues = [
    ...findUnknownIds("remove.rooms", remove.rooms, apartment.rooms, "room"),
    ...findUnknownIds("remove.walls", remove.walls, apartment.walls, "wall"),
    ...findUnknownIds("remove.openings", remove.openings, apartment.openings, "opening"),
  ];
  if (issues.length > 0) return fail(issues);

  const cascadedOpeningIds = apartment.openings.filter((opening) => remove.walls.includes(opening.wallId)).map((opening) => opening.id);
  const removedOpeningIds = [...new Set([...remove.openings, ...cascadedOpeningIds])];

  const candidate = {
    ...content,
    apartment: {
      meta: { ...apartment.meta, ...upsert.meta },
      rooms: mergeByKey(keepOthers(apartment.rooms, remove.rooms), upsert.rooms ?? [], "id"),
      walls: mergeByKey(keepOthers(apartment.walls, remove.walls), upsert.walls ?? [], "id"),
      openings: mergeByKey(keepOthers(apartment.openings, removedOpeningIds), upsert.openings ?? [], "id"),
    },
  };
  const upsertedIds = [...(upsert.rooms ?? []), ...(upsert.walls ?? []), ...(upsert.openings ?? [])].map((entry) => entry.id);
  return validateResult(documentContentSchema, candidate, [...upsertedIds, ...remove.rooms, ...remove.walls, ...removedOpeningIds]);
}

export function replaceMaterialReferences(
  content: DocumentContent,
  materialId: string,
  replacementId: string | null,
): OperationResult<DocumentContent> {
  const changedIds: string[] = [];

  const rooms = content.apartment.rooms.map((room) => {
    const affectedKeys = ROOM_MATERIAL_FIELDS.filter((key) => room[key] === materialId);
    if (affectedKeys.length === 0) return room;
    changedIds.push(room.id);
    return { ...room, ...Object.fromEntries(affectedKeys.map((key) => [key, replacementId])) };
  });
  const openings = content.apartment.openings.map((opening) => {
    const affectedKeys = OPENING_MATERIAL_FIELDS.filter((key) => opening[key] === materialId);
    if (affectedKeys.length === 0) return opening;
    changedIds.push(opening.id);
    return { ...opening, ...Object.fromEntries(affectedKeys.map((key) => [key, replacementId])) };
  });

  return validateResult(documentContentSchema, { ...content, apartment: { ...content.apartment, rooms, openings } }, changedIds);
}
