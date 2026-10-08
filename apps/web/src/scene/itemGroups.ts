import type { Item } from "@app/core";
import type { Object3D } from "three";

// The scene graph groups of the items by id. A drag moves them directly, frame by frame, without a React render.
const groups = new Map<string, Object3D>();

export function registerItemGroup(itemId: string, group: Object3D | null): void {
  if (group) groups.set(itemId, group);
  else groups.delete(itemId);
}

export function getItemGroup(itemId: string): Object3D | undefined {
  return groups.get(itemId);
}

export function placeItemGroup(itemId: string, x: number, z: number): void {
  groups.get(itemId)?.position.set(x, 0, z);
}

/** Puts every group back where the document says; needed after a cancelled or rejected drag, because React sees no prop change. */
export function placeItemGroupsFromItems(items: Item[]): void {
  for (const item of items) placeItemGroup(item.id, item.x, item.z);
}
