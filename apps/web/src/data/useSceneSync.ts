import { useEffect, useState } from "react";
import { de } from "../i18n/de.ts";
import { clearCachedScene, restoreCachedScene, startCachePersistence } from "./sceneCache.ts";
import { loadDocument, loadScene } from "./loadScene.ts";
import { startRealtimeSync, type SyncedTable } from "./realtimeSync.ts";
import { EMPTY_SCENE_DATA, useSceneStore, type RowChange } from "./store.ts";
import { getSupabase } from "./supabaseClient.ts";

export type DataAccess = "unknown" | "granted" | "denied";

function applyChange(table: SyncedTable, change: RowChange, reloadDocument: () => void): void {
  const store = useSceneStore.getState();
  try {
    if (table === "documents") store.applyDocumentChange(change);
    else if (table === "assets") store.applyAssetChange(change);
    else if (table === "materials") store.applyMaterialChange(change);
    else if (store.applyAppStateChange(change)) reloadDocument();
  } catch (error) {
    console.error(`Ignoring invalid ${table} change`, error);
  }
}

/** Keeps the scene store in sync with Supabase while `enabled` (a session exists); returns whether the data is readable. */
export function useSceneSync(enabled: boolean): DataAccess {
  const [access, setAccess] = useState<DataAccess>("unknown");

  useEffect(() => {
    if (!enabled) return;
    const client = getSupabase();
    const store = useSceneStore.getState();
    let isCancelled = false;

    const reloadDocument = async (): Promise<void> => {
      try {
        const document = await loadDocument(client, useSceneStore.getState().appState?.activeDocumentId ?? null);
        if (!isCancelled) useSceneStore.getState().setSceneData({ document });
      } catch (error) {
        console.error("Reloading the active document failed", error);
      }
    };

    const reload = async (): Promise<void> => {
      try {
        const loaded = await loadScene(client);
        if (isCancelled) return;
        if (!loaded) {
          setAccess("denied");
          useSceneStore.getState().setSceneData({ ...EMPTY_SCENE_DATA, status: "ready" });
          clearCachedScene();
          return;
        }
        // A realtime event may have delivered a newer document while the load was in flight.
        const current = useSceneStore.getState().document;
        const isStale = current && loaded.document?.id === current.id && current.version > loaded.document.version;
        setAccess("granted");
        useSceneStore.getState().setSceneData({ ...loaded, document: isStale ? current : loaded.document, status: "ready", error: null });
      } catch (error) {
        console.error("Loading the scene failed", error);
        if (!isCancelled) useSceneStore.getState().setError(de.data.loadFailed);
      }
    };

    restoreCachedScene();
    store.setLoading();
    const stopCache = startCachePersistence();
    const stopRealtime = startRealtimeSync(client, {
      onChange: (table, change) => applyChange(table, change, () => void reloadDocument()),
      onReconnect: () => void reload(),
    });
    void reload();

    return () => {
      isCancelled = true;
      stopRealtime();
      stopCache();
    };
  }, [enabled]);

  return enabled ? access : "unknown";
}
