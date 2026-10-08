import type { Item, ItemPatch } from "@app/core";
import { dragDelta, dragPatches, isClick, snapStepFor, type FloorPoint } from "../editor/drag.ts";
import type { DragPreview } from "../editor/editorStore.ts";
import { placeItemGroup } from "./itemGroups.ts";

const CLICK_DISTANCE_PX = 4;
/** The layout check, shadow bake and annotations follow the drag at this rate; the item itself moves every frame. */
export const PREVIEW_PUSH_INTERVAL_MS = 66;

export type PressSessionOptions = {
  pointerId: number;
  startPixel: { x: number; y: number };
  /** Null when the press cannot start a drag (not selected, locked, modifier held). */
  drag: { startFloorPoint: FloorPoint; items: Item[]; selectedIds: string[] } | null;
  floorPointAt: (clientX: number, clientY: number) => FloorPoint | null;
  setOrbitEnabled: (isEnabled: boolean) => void;
  setCursor: (cursor: string) => void;
  setPreview: (preview: DragPreview | null) => void;
  /** Moves the item groups back to the document after the preview ended. */
  restoreGroups: () => void;
  commitMove: (patches: ItemPatch[]) => Promise<unknown>;
  onClick: (pointer: PointerEvent) => void;
};

function toPreview(patches: ItemPatch[]): DragPreview {
  return new Map(patches.map((patch) => [patch.id, { x: patch.x ?? 0, z: patch.z ?? 0 }]));
}

/** Counts started presses, so the cleanup of a finished drag does not touch a newer one. */
let latestSession = 0;

/**
 * One press on an item from pointer down to its end: a click, a drag that commits once, or an abort.
 * Every exit path (release, cancel, lost capture, window blur, buttons released elsewhere) goes through
 * `end`, which always gives orbit, cursor and preview back.
 */
export function startPressSession(options: PressSessionOptions): void {
  const { drag } = options;
  const session = ++latestSession;
  let latest: PointerEvent | null = null;
  let frame = 0;
  let lastPushAt = -Infinity;
  let isDragging = false;

  if (drag) options.setOrbitEnabled(false);

  const patchesAt = (pointer: PointerEvent): ItemPatch[] | null => {
    const current = options.floorPointAt(pointer.clientX, pointer.clientY);
    if (!drag || !current) return null;
    const delta = dragDelta(drag.startFloorPoint, current);
    return isClick(delta) ? null : dragPatches(drag.items, drag.selectedIds, delta, snapStepFor(pointer.shiftKey));
  };

  const showFrame = (now: number): void => {
    frame = 0;
    const patches = latest ? patchesAt(latest) : null;
    if (!patches) return;
    if (!isDragging) options.setCursor("grabbing");
    isDragging = true;
    for (const patch of patches) placeItemGroup(patch.id, patch.x ?? 0, patch.z ?? 0);
    if (now - lastPushAt >= PREVIEW_PUSH_INTERVAL_MS) {
      lastPushAt = now;
      options.setPreview(toPreview(patches));
    }
  };

  const removeListeners = (): void => {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
    window.removeEventListener("pointercancel", abortPointer);
    window.removeEventListener("lostpointercapture", abortPointer);
    window.removeEventListener("blur", abort);
  };

  const end = (): void => {
    removeListeners();
    cancelAnimationFrame(frame);
    options.setOrbitEnabled(true);
    options.setCursor("");
  };

  function abort(): void {
    end();
    options.setPreview(null);
    if (isDragging) options.restoreGroups();
  }

  function abortPointer(pointer: PointerEvent): void {
    if (pointer.pointerId === options.pointerId) abort();
  }

  function handleMove(pointer: PointerEvent): void {
    if (pointer.pointerId !== options.pointerId) return;
    // The release happened outside of the window or was swallowed: nobody is holding the button any more.
    if (pointer.buttons === 0) {
      abort();
      return;
    }
    latest = pointer;
    if (drag && frame === 0) frame = requestAnimationFrame(showFrame);
  }

  function handleUp(pointer: PointerEvent): void {
    if (pointer.pointerId !== options.pointerId) return;
    const patches = patchesAt(pointer);
    end();
    if (patches) {
      options.setPreview(toPreview(patches));
      void options.commitMove(patches).finally(() => {
        if (session !== latestSession) return;
        options.setPreview(null);
        options.restoreGroups();
      });
      return;
    }
    options.setPreview(null);
    if (isDragging) options.restoreGroups();
    const moved = Math.hypot(pointer.clientX - options.startPixel.x, pointer.clientY - options.startPixel.y);
    if (!isDragging && moved < CLICK_DISTANCE_PX) options.onClick(pointer);
  }

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
  window.addEventListener("pointercancel", abortPointer);
  window.addEventListener("lostpointercapture", abortPointer);
  window.addEventListener("blur", abort);
}
