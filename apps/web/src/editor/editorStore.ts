import { create } from "zustand";
import { EMPTY_SELECTION, selectionReducer, type SelectionAction, type SelectionState } from "./selection.ts";

/** Live positions of items while they are dragged; only the preview, nothing is written. */
export type DragPreview = ReadonlyMap<string, { x: number; z: number }>;

export type Toast = { id: number; message: string };

type EditorState = {
  selection: SelectionState;
  dragPreview: DragPreview | null;
  toast: Toast | null;
  isShortcutDialogOpen: boolean;
};

type EditorActions = {
  dispatchSelection: (action: SelectionAction) => void;
  /** Takes over a whole selection, e.g. the copies after a duplicate or an incoming app_state change. */
  replaceSelection: (selection: SelectionState) => void;
  setDragPreview: (preview: DragPreview | null) => void;
  showToast: (message: string) => void;
  dismissToast: () => void;
  setShortcutDialogOpen: (isOpen: boolean) => void;
};

let nextToastId = 1;

export function isSameSelection(a: SelectionState, b: SelectionState): boolean {
  return a.focusId === b.focusId && a.selectedIds.length === b.selectedIds.length && a.selectedIds.every((id, index) => id === b.selectedIds[index]);
}

/** Local UI state of the editor; the document itself lives in the scene store. */
export const useEditorStore = create<EditorState & EditorActions>()((set) => ({
  selection: EMPTY_SELECTION,
  dragPreview: null,
  toast: null,
  isShortcutDialogOpen: false,
  dispatchSelection: (action) =>
    set((state) => {
      const next = selectionReducer(state.selection, action);
      return isSameSelection(next, state.selection) ? state : { selection: next };
    }),
  replaceSelection: (selection) => set({ selection }),
  setDragPreview: (dragPreview) => set({ dragPreview }),
  showToast: (message) => set({ toast: { id: nextToastId++, message } }),
  dismissToast: () => set({ toast: null }),
  setShortcutDialogOpen: (isShortcutDialogOpen) => set({ isShortcutDialogOpen }),
}));
