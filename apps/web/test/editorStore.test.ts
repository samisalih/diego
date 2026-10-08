import { beforeEach, describe, expect, it } from "vitest";
import { isSameSelection, useEditorStore } from "../src/editor/editorStore.ts";
import { EMPTY_SELECTION, type SelectionState } from "../src/editor/selection.ts";

// Contract: docs/specs/editor.md section 3.1. A dispatch that does not change the selection must not touch the store
// (no new state object, no subscriber call), so React consumers do not re-render.

const state = (selectedIds: string[], focusId: string | null = null): SelectionState => ({ selectedIds, focusId });

describe("isSameSelection", () => {
  // Red if equality is by reference only.
  it("is true for equal content in different objects", () => {
    expect(isSameSelection(state(["item_a", "item_b"], null), state(["item_a", "item_b"], null))).toBe(true);
    expect(isSameSelection(EMPTY_SELECTION, state([]))).toBe(true);
  });

  // Red if the focus is ignored.
  it("is false when only the focus differs", () => {
    expect(isSameSelection(state([], "room_living"), state([], null))).toBe(false);
    expect(isSameSelection(state([], "room_living"), state([], "wall_north"))).toBe(false);
  });

  // Red if only the shorter list is compared (prefix match).
  it("is false when one list is a prefix of the other", () => {
    expect(isSameSelection(state(["item_a"]), state(["item_a", "item_b"]))).toBe(false);
    expect(isSameSelection(state(["item_a", "item_b"]), state(["item_a"]))).toBe(false);
  });

  // Red if a different id at any position is overlooked.
  it("is false when an id differs", () => {
    expect(isSameSelection(state(["item_a", "item_b"]), state(["item_a", "item_c"]))).toBe(false);
  });

  // Red if the order is ignored: the selection is an ordered list (spec 3.1).
  it("is false when the order differs", () => {
    expect(isSameSelection(state(["item_a", "item_b"]), state(["item_b", "item_a"]))).toBe(false);
  });
});

describe("useEditorStore dispatchSelection", () => {
  beforeEach(() => {
    useEditorStore.setState({ selection: EMPTY_SELECTION });
  });

  function countNotifications(): { count: () => number; stop: () => void } {
    let calls = 0;
    const stop = useEditorStore.subscribe(() => {
      calls += 1;
    });
    return { count: () => calls, stop };
  }

  // Red if a no-op action replaces the state object (every subscriber would re-render).
  it("keeps the state object and notifies nobody when selecting the already selected item", () => {
    useEditorStore.getState().dispatchSelection({ type: "select", id: "item_a" });
    const before = useEditorStore.getState();
    const watcher = countNotifications();
    useEditorStore.getState().dispatchSelection({ type: "select", id: "item_a" });
    watcher.stop();
    expect(useEditorStore.getState()).toBe(before);
    expect(useEditorStore.getState().selection).toBe(before.selection);
    expect(watcher.count()).toBe(0);
  });

  // Red if clearing an empty selection notifies.
  it("is a no-op for clear on an empty selection", () => {
    const before = useEditorStore.getState();
    const watcher = countNotifications();
    useEditorStore.getState().dispatchSelection({ type: "clear" });
    watcher.stop();
    expect(useEditorStore.getState()).toBe(before);
    expect(watcher.count()).toBe(0);
  });

  // Red if prune with only existing ids notifies.
  it("is a no-op for prune when every selected id still exists", () => {
    useEditorStore.getState().dispatchSelection({ type: "select", id: "item_a" });
    const before = useEditorStore.getState();
    useEditorStore.getState().dispatchSelection({ type: "prune", existingIds: ["item_a", "item_b"] });
    expect(useEditorStore.getState()).toBe(before);
  });

  // Red if a real change is swallowed by the no-op check.
  it("applies a real change and notifies once", () => {
    const watcher = countNotifications();
    useEditorStore.getState().dispatchSelection({ type: "select", id: "item_a" });
    useEditorStore.getState().dispatchSelection({ type: "toggle", id: "item_b" });
    watcher.stop();
    expect(useEditorStore.getState().selection).toEqual({ selectedIds: ["item_a", "item_b"], focusId: null });
    expect(watcher.count()).toBe(2);
  });

  // Red if a focus change that leaves the id list equal is treated as no change.
  it("applies a focus change on an empty selection", () => {
    useEditorStore.getState().dispatchSelection({ type: "focus", id: "room_living" });
    expect(useEditorStore.getState().selection).toEqual({ selectedIds: [], focusId: "room_living" });
  });

  // Red if selecting an item while a room is focused is swallowed (the id list differs, the focus is dropped).
  it("applies a select that drops the focus", () => {
    useEditorStore.getState().dispatchSelection({ type: "focus", id: "room_living" });
    useEditorStore.getState().dispatchSelection({ type: "select", id: "item_a" });
    expect(useEditorStore.getState().selection).toEqual({ selectedIds: ["item_a"], focusId: null });
  });
});
