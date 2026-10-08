import type { Item, ItemPatch } from "@app/core";
import type { ThreeEvent } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { Raycaster, Vector2 } from "three";
import { useSceneStore } from "../data/store.ts";
import { dragPatches, floorPointFromRay, isClick, snapStepFor, dragDelta, type FloorPoint } from "../editor/drag.ts";
import { getEditorCommands } from "../editor/commandsRegistry.ts";
import { useEditorStore, type DragPreview } from "../editor/editorStore.ts";

const CLICK_DISTANCE_PX = 4;

export type ItemPointerHandlers = {
  onPointerDown: (item: Item, event: ThreeEvent<PointerEvent>) => void;
  onPointerOver: (item: Item) => void;
  onPointerOut: () => void;
};

type OrbitSwitch = { enabled: boolean };

function toPreview(patches: ItemPatch[]): DragPreview {
  return new Map(patches.map((patch) => [patch.id, { x: patch.x ?? 0, z: patch.z ?? 0 }]));
}

function cursorFor(item: Item): string {
  if (item.locked) return "not-allowed";
  return useEditorStore.getState().selection.selectedIds.includes(item.id) ? "grab" : "pointer";
}

function hasToggleModifier(event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): boolean {
  return event.shiftKey || event.metaKey || event.ctrlKey;
}

/**
 * Click and drag on furniture. A click selects (Shift / Cmd / Ctrl toggles); pressing on a selected,
 * unlocked item and moving drags all selected unlocked items on the floor. The drag only changes the
 * preview in the editor store, one commit follows on release. Window listeners (not R3F events) keep
 * the drag alive when the pointer leaves the item.
 */
export function useItemInteraction(): ItemPointerHandlers {
  const get = useThree((state) => state.get);

  return useMemo(() => {
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const setCursor = (cursor: string): void => {
      get().gl.domElement.style.cursor = cursor;
    };

    const floorPointAt = (clientX: number, clientY: number): FloorPoint | null => {
      const { camera, gl } = get();
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const { origin, direction } = raycaster.ray;
      return floorPointFromRay([origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z]);
    };

    const setOrbitEnabled = (isEnabled: boolean): void => {
      const controls = get().controls as unknown as OrbitSwitch | null;
      if (controls) controls.enabled = isEnabled;
    };

    function selectOnClick(itemId: string, event: PointerEvent): void {
      const { dispatchSelection } = useEditorStore.getState();
      dispatchSelection({ type: hasToggleModifier(event) ? "toggle" : "select", id: itemId });
    }

    function onPointerDown(item: Item, event: ThreeEvent<PointerEvent>): void {
      const native = event.nativeEvent;
      if (native.button !== 0) return;
      event.stopPropagation();

      const items = useSceneStore.getState().document?.items ?? [];
      const selectedIds = useEditorStore.getState().selection.selectedIds;
      const startFloorPoint = floorPointFromRay(event.ray.origin.toArray(), event.ray.direction.toArray());
      const canDrag = selectedIds.includes(item.id) && !item.locked && startFloorPoint !== null && !hasToggleModifier(native);
      const startPixel = { x: native.clientX, y: native.clientY };
      let latest: PointerEvent = native;
      let frame = 0;
      let isDragging = false;

      if (canDrag) setOrbitEnabled(false);

      const patchesFor = (pointer: PointerEvent) => {
        const current = floorPointAt(pointer.clientX, pointer.clientY);
        if (!canDrag || !current || !startFloorPoint) return null;
        const delta = dragDelta(startFloorPoint, current);
        return isClick(delta) ? null : dragPatches(items, selectedIds, delta, snapStepFor(pointer.shiftKey));
      };

      const showPreview = (): void => {
        frame = 0;
        const patches = patchesFor(latest);
        if (!patches) return;
        if (!isDragging) setCursor("grabbing");
        isDragging = true;
        useEditorStore.getState().setDragPreview(toPreview(patches));
      };

      const onMove = (pointer: PointerEvent): void => {
        latest = pointer;
        if (canDrag && frame === 0) frame = requestAnimationFrame(showPreview);
      };

      const finish = (pointer: PointerEvent): void => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        cancelAnimationFrame(frame);
        setOrbitEnabled(true);
        const patches = pointer.type === "pointerup" ? patchesFor(pointer) : null;
        setCursor("");
        if (patches && getEditorCommands()) {
          const { setDragPreview } = useEditorStore.getState();
          setDragPreview(toPreview(patches));
          void getEditorCommands()!.moveItems(patches).finally(() => setDragPreview(null));
          return;
        }
        useEditorStore.getState().setDragPreview(null);
        const moved = Math.hypot(pointer.clientX - startPixel.x, pointer.clientY - startPixel.y);
        if (pointer.type === "pointerup" && !isDragging && moved < CLICK_DISTANCE_PX) selectOnClick(item.id, pointer);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    }

    return {
      onPointerDown,
      onPointerOver: (item) => setCursor(cursorFor(item)),
      onPointerOut: () => setCursor(""),
    };
  }, [get]);
}
