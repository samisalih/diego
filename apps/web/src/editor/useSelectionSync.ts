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

const MAX_REMEMBERED_ECHOES = 8;

function keyOf(selection: SelectionState): string {
  return JSON.stringify([selection.selectedIds, selection.focusId]);
}

/**
 * Mirrors the local selection to `app_state` (debounced, no revision) and takes over selection changes
 * that arrive from outside (Claude). Every written selection is remembered until its echo arrives, so echoes
 * are ignored even when newer writes are already on their way; any other incoming selection is a foreign
 * change, wins over a write that is still waiting in the debounce, and cancels it.
 */
export function useSelectionSync(client: SupabaseClient | null): void {
  useEffect(() => {
    if (!client) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const awaitedEchoes: string[] = [];

    const initial = selectionOfAppState();
    if (initial) useEditorStore.getState().replaceSelection(initial);

    const write = async (): Promise<void> => {
      timer = undefined;
      const local = useEditorStore.getState().selection;
      const remote = selectionOfAppState();
      if (remote && isSameSelection(local, remote)) return;
      awaitedEchoes.push(keyOf(local));
      if (awaitedEchoes.length > MAX_REMEMBERED_ECHOES) awaitedEchoes.shift();
      const { error } = await client.from("app_state").update({ selection: local.selectedIds, focus_id: local.focusId }).eq("id", APP_STATE_ROW_ID);
      if (error) console.error("Writing the selection failed", error);
    };

    const stopLocal = useEditorStore.subscribe((state, previous) => {
      if (state.selection === previous.selection) return;
      clearTimeout(timer);
      timer = setTimeout(() => void write(), WRITE_DEBOUNCE_MS);
    });

    const stopRemote = useSceneStore.subscribe((state, previous) => {
      if (state.appState === previous.appState || !state.appState) return;
      const incoming = selectionOfAppState();
      if (!incoming) return;
      // Other app_state fields (e.g. ai_busy_until) change independently of the selection.
      if (keyOf(incoming) === keyOf({ selectedIds: previous.appState?.selection ?? [], focusId: previous.appState?.focusId ?? null })) return;
      const echoIndex = awaitedEchoes.indexOf(keyOf(incoming));
      if (echoIndex >= 0) {
        awaitedEchoes.splice(0, echoIndex + 1);
        return;
      }
      if (isSameSelection(incoming, useEditorStore.getState().selection)) return;
      clearTimeout(timer);
      timer = undefined;
      useEditorStore.getState().replaceSelection(incoming);
    });

    return () => {
      clearTimeout(timer);
      stopLocal();
      stopRemote();
    };
  }, [client]);
}
