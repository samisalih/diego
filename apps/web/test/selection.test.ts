import { describe, expect, it } from "vitest";
import { EMPTY_SELECTION, selectionReducer, type SelectionState } from "../src/editor/selection.ts";

// Contract: docs/specs/editor.md section 3.1. Interpretations made by the tests (the implementation follows them):
// - SelectionState = { selectedIds: string[]; focusId: string | null }; EMPTY_SELECTION = { selectedIds: [], focusId: null }
// - actions: { type: "select"; id } | { type: "toggle"; id } | { type: "clear" } | { type: "prune"; existingIds: string[] }
//   | { type: "focus"; id: string | null }
// - select / toggle / clear drop the focus; focus(id) clears the item selection and sets focusId (read-only inspection of
//   rooms, walls, openings); selectedIds keep the order in which items were added
// - prune also drops focusId when it is not in existingIds

const state = (selectedIds: string[], focusId: string | null = null): SelectionState => ({ selectedIds, focusId });

describe("selectionReducer", () => {
  it("starts empty", () => {
    expect(EMPTY_SELECTION).toEqual({ selectedIds: [], focusId: null });
  });

  describe("select", () => {
    // Red if select adds to the selection instead of replacing it.
    it("replaces the whole selection with the given id", () => {
      expect(selectionReducer(state(["item_a", "item_b"]), { type: "select", id: "item_c" })).toEqual(state(["item_c"]));
    });

    // Red if selecting an already selected item keeps the others (a plain click on one of several must reduce to one).
    it("reduces a multi-selection to the clicked member", () => {
      expect(selectionReducer(state(["item_a", "item_b"]), { type: "select", id: "item_b" })).toEqual(state(["item_b"]));
    });

    // Red if the focus of a room stays while an item is selected.
    it("drops the focus", () => {
      expect(selectionReducer(state([], "room_living"), { type: "select", id: "item_a" })).toEqual(state(["item_a"]));
    });
  });

  describe("toggle", () => {
    // Red if toggle replaces instead of extending, or if the order of insertion is lost.
    it("appends an unselected id at the end", () => {
      expect(selectionReducer(state(["item_a", "item_b"]), { type: "toggle", id: "item_c" }).selectedIds).toEqual(["item_a", "item_b", "item_c"]);
    });

    // Red if toggling a selected id does not remove exactly that id.
    it("removes a selected id and keeps the order of the rest", () => {
      expect(selectionReducer(state(["item_a", "item_b", "item_c"]), { type: "toggle", id: "item_b" }).selectedIds).toEqual(["item_a", "item_c"]);
    });

    // Red if toggling twice is not the identity.
    it("is its own inverse", () => {
      const once = selectionReducer(state(["item_a"]), { type: "toggle", id: "item_b" });
      expect(selectionReducer(once, { type: "toggle", id: "item_b" })).toEqual(state(["item_a"]));
    });

    // Red if toggle on an empty selection does not select.
    it("selects on an empty selection and drops the focus", () => {
      expect(selectionReducer(state([], "wall_north"), { type: "toggle", id: "item_a" })).toEqual(state(["item_a"]));
    });
  });

  describe("clear", () => {
    // Red if clear leaves ids or the focus behind.
    it("empties selection and focus", () => {
      expect(selectionReducer(state(["item_a", "item_b"]), { type: "clear" })).toEqual(EMPTY_SELECTION);
      expect(selectionReducer(state([], "room_living"), { type: "clear" })).toEqual(EMPTY_SELECTION);
    });
  });

  describe("focus", () => {
    // Red if focusing keeps the item selection (inspector would not know what to show).
    it("sets the focus and clears the item selection", () => {
      expect(selectionReducer(state(["item_a"]), { type: "focus", id: "room_living" })).toEqual(state([], "room_living"));
    });

    it("clears the focus with null", () => {
      expect(selectionReducer(state([], "room_living"), { type: "focus", id: null })).toEqual(EMPTY_SELECTION);
    });
  });

  describe("prune", () => {
    // Red if ids of deleted items stay selected (e.g. after a remote delete).
    it("drops ids that no longer exist and keeps the order of the rest", () => {
      const next = selectionReducer(state(["item_a", "item_b", "item_c"]), { type: "prune", existingIds: ["item_c", "item_a", "item_x"] });
      expect(next.selectedIds).toEqual(["item_a", "item_c"]);
    });

    // Red if a vanished focus target stays focused.
    it("drops a focus that no longer exists and keeps one that does", () => {
      expect(selectionReducer(state([], "room_gone"), { type: "prune", existingIds: ["room_living"] }).focusId).toBeNull();
      expect(selectionReducer(state([], "room_living"), { type: "prune", existingIds: ["room_living"] }).focusId).toBe("room_living");
    });

    // Red if prune with everything existing changes the content.
    it("keeps the selection when every id exists", () => {
      expect(selectionReducer(state(["item_a", "item_b"]), { type: "prune", existingIds: ["item_a", "item_b"] })).toEqual(state(["item_a", "item_b"]));
    });

    // Red if prune with an empty list does not empty the selection.
    it("empties the selection when nothing exists", () => {
      expect(selectionReducer(state(["item_a"], null), { type: "prune", existingIds: [] })).toEqual(EMPTY_SELECTION);
    });
  });

  // Red if the reducer mutates its input (React state must stay immutable).
  it("does not mutate the previous state", () => {
    const previous = Object.freeze({ selectedIds: Object.freeze(["item_a", "item_b"]) as unknown as string[], focusId: null });
    for (const action of [
      { type: "select", id: "item_c" },
      { type: "toggle", id: "item_a" },
      { type: "toggle", id: "item_z" },
      { type: "clear" },
      { type: "prune", existingIds: ["item_a"] },
    ] as const) {
      expect(() => selectionReducer(previous, action)).not.toThrow();
    }
    expect(previous.selectedIds).toEqual(["item_a", "item_b"]);
  });
});
