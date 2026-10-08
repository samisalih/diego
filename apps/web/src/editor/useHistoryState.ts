import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useSceneStore } from "../data/store.ts";

export type HistoryState = { canUndo: boolean; canRedo: boolean };

const NO_HISTORY: HistoryState = { canUndo: false, canRedo: false };
const REFRESH_DEBOUNCE_MS = 150;

type HistoryRow = { can_undo: boolean; can_redo: boolean };

function toHistoryState(data: unknown): HistoryState {
  const row = (Array.isArray(data) ? data[0] : data) as HistoryRow | null | undefined;
  return row ? { canUndo: row.can_undo, canRedo: row.can_redo } : NO_HISTORY;
}

/**
 * Undo / redo availability from `document_history_state`. Every commit, undo, redo and Realtime
 * document event changes the document version, so refreshing on a version change covers all of them.
 * Without a client (fixture mode) nothing is available.
 */
export function useHistoryState(client: SupabaseClient | null): HistoryState {
  const documentId = useSceneStore((state) => state.document?.id ?? null);
  const version = useSceneStore((state) => state.document?.version ?? null);
  const [history, setHistory] = useState<HistoryState>(NO_HISTORY);

  useEffect(() => {
    if (!client || documentId === null) return;
    let isStale = false;
    const timer = setTimeout(() => {
      void client.rpc("document_history_state", { p_id: documentId }).then(({ data, error }) => {
        if (isStale) return;
        if (error) console.error("Reading the history state failed", error);
        else setHistory(toHistoryState(data));
      });
    }, REFRESH_DEBOUNCE_MS);
    return () => {
      isStale = true;
      clearTimeout(timer);
    };
  }, [client, documentId, version]);

  return client ? history : NO_HISTORY;
}
