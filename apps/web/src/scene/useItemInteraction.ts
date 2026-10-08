import type { Item } from "@app/core";
import type { ThreeEvent } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { Raycaster, Vector2 } from "three";
import { useSceneStore } from "../data/store.ts";
import { getEditorCommands } from "../editor/commandsRegistry.ts";
import { floorPointFromRay, type FloorPoint } from "../editor/drag.ts";
import { useEditorStore } from "../editor/editorStore.ts";
import { isToggleModifier } from "../editor/selectionModifiers.ts";
import { placeItemGroupsFromItems } from "./itemGroups.ts";
import { startPressSession } from "./dragSession.ts";

export type ItemPointerHandlers = {
  onPointerDown: (item: Item, event: ThreeEvent<PointerEvent>) => void;
  onPointerOver: (item: Item) => void;
  onPointerOut: () => void;
};

type OrbitSwitch = { enabled: boolean };

function cursorFor(item: Item): string {
  if (item.locked) return "not-allowed";
  return useEditorStore.getState().selection.selectedIds.includes(item.id) ? "grab" : "pointer";
}

function restoreGroups(): void {
  placeItemGroupsFromItems(useSceneStore.getState().document?.items ?? []);
}

/**
 * Click and drag on furniture. A click selects (Shift / Cmd / Ctrl toggles); pressing on a selected,
 * unlocked item and moving drags all selected unlocked items on the floor (see dragSession.ts).
 */
export function useItemInteraction(): ItemPointerHandlers {
  const get = useThree((state) => state.get);

  return useMemo(() => {
    const raycaster = new Raycaster();
    const ndc = new Vector2();

    const floorPointAt = (clientX: number, clientY: number): FloorPoint | null => {
      const { camera, gl } = get();
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const { origin, direction } = raycaster.ray;
      return floorPointFromRay([origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z]);
    };

    const setCursor = (cursor: string): void => {
      get().gl.domElement.style.cursor = cursor;
    };

    const setOrbitEnabled = (isEnabled: boolean): void => {
      const controls = get().controls as unknown as OrbitSwitch | null;
      if (controls) controls.enabled = isEnabled;
    };

    function onPointerDown(item: Item, event: ThreeEvent<PointerEvent>): void {
      const native = event.nativeEvent;
      if (native.button !== 0) return;
      event.stopPropagation();

      const selectedIds = useEditorStore.getState().selection.selectedIds;
      const startFloorPoint = floorPointFromRay(event.ray.origin.toArray(), event.ray.direction.toArray());
      const canDrag = selectedIds.includes(item.id) && !item.locked && startFloorPoint !== null && !isToggleModifier(native);

      startPressSession({
        pointerId: native.pointerId,
        startPixel: { x: native.clientX, y: native.clientY },
        drag: canDrag && startFloorPoint ? { startFloorPoint, items: useSceneStore.getState().document?.items ?? [], selectedIds } : null,
        floorPointAt,
        setOrbitEnabled,
        setCursor,
        setPreview: useEditorStore.getState().setDragPreview,
        restoreGroups,
        commitMove: (patches) => getEditorCommands()?.moveItems(patches) ?? Promise.resolve(),
        onClick: (pointer) => useEditorStore.getState().dispatchSelection({ type: isToggleModifier(pointer) ? "toggle" : "select", id: item.id }),
      });
    }

    return {
      onPointerDown,
      onPointerOver: (item) => setCursor(cursorFor(item)),
      onPointerOut: () => setCursor(""),
    };
  }, [get]);
}
