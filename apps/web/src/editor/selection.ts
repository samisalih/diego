/** Selected item ids in click order, plus a read-only focus on a room, wall or opening. */
export type SelectionState = { selectedIds: string[]; focusId: string | null };

export type SelectionAction =
  | { type: "select"; id: string }
  | { type: "toggle"; id: string }
  | { type: "clear" }
  | { type: "focus"; id: string | null }
  | { type: "prune"; existingIds: readonly string[] };

export const EMPTY_SELECTION: SelectionState = { selectedIds: [], focusId: null };

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((selectedId) => selectedId !== id) : [...ids, id];
}

/** Pure reducer for the selection; every action except prune drops the focus or the item selection it replaces. */
export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case "select":
      return { selectedIds: [action.id], focusId: null };
    case "toggle":
      return { selectedIds: toggleId(state.selectedIds, action.id), focusId: null };
    case "clear":
      return EMPTY_SELECTION;
    case "focus":
      return { selectedIds: [], focusId: action.id };
    case "prune": {
      const existing = new Set(action.existingIds);
      return {
        selectedIds: state.selectedIds.filter((id) => existing.has(id)),
        focusId: state.focusId !== null && existing.has(state.focusId) ? state.focusId : null,
      };
    }
  }
}
