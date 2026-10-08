import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect } from "react";
import { useSceneStore } from "../data/store.ts";
import { isSameSelection, useEditorStore } from "./editorStore.ts";
import type { SelectionState } from "./selection.ts";

const WRITE_DEBOUNCE_MS = 300;
const APP_STATE_ROW_ID = 1;

function selectionOfAppState(): SelectionState | null {
  const appState = useSceneStore.getState().appState;
  return appState ? { selectedIds: appState.selection, focusId: appState.focusId } : null;
}

function existingIdsOf(document: NonNullable<ReturnType<typeof useSceneStore.getState>["document"]>): string[] {
  const { rooms, walls, openings } = document.apartment;
  return [...document.items, ...rooms, ...walls, ...openings].map((entry) => entry.id);
}

/** Drops selected ids that no longer exist whenever the document changes (e.g. a remote delete). */
export function usePruneSelection(): void {
  useEffect(() => {
    return useSceneStore.subscribe((state, previous) => {
      if (!state.document || state.document === previous.document) return;
      useEditorStore.getState().dispatchSelection({ type: "prune", existingIds: existingIdsOf(state.document) });
    });
  }, []);
}

/**
 * Mirrors the local selection to `app_state` (debounced, no revision) and takes over selection changes
 * that arrive from outside (Claude). Writes are skipped when the row already holds the selection, which
 * also stops an incoming change from being written straight back.
 */
export function useSelectionSync(client: SupabaseClient | null): void {
  useEffect(() => {
    if (!client) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let isWriting = false;

    const initial = selectionOfAppState();
    if (initial) useEditorStore.getState().replaceSelection(initial);

    const write = async (): Promise<void> => {
      timer = undefined;
      const local = useEditorStore.getState().selection;
      const remote = selectionOfAppState();
      if (remote && isSameSelection(local, remote)) return;
      isWriting = true;
      const { error } = await client.from("app_state").update({ selection: local.selectedIds, focus_id: local.focusId }).eq("id", APP_STATE_ROW_ID);
      isWriting = false;
      if (error) console.error("Writing the selection failed", error);
    };

    const stopLocal = useEditorStore.subscribe((state, previous) => {
      if (state.selection === previous.selection) return;
      clearTimeout(timer);
      timer = setTimeout(() => void write(), WRITE_DEBOUNCE_MS);
    });

    const stopRemote = useSceneStore.subscribe((state, previous) => {
      if (state.appState === previous.appState || !state.appState) return;
      // Echoes of our own write arrive while a write is pending or in flight; only foreign changes are applied.
      if (timer !== undefined || isWriting) return;
      const incoming = selectionOfAppState();
      if (incoming && !isSameSelection(incoming, useEditorStore.getState().selection)) useEditorStore.getState().replaceSelection(incoming);
    });

    return () => {
      clearTimeout(timer);
      stopLocal();
      stopRemote();
    };
  }, [client]);
}
