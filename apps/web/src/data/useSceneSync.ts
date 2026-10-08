import { useCallback, useEffect, useRef, useState } from "react";
import { de } from "../i18n/de.ts";
import { loadDocument, loadScene } from "./loadScene.ts";
import { restoreCachedScene, startCachePersistence } from "./sceneCache.ts";
import { startRealtimeSync } from "./realtimeSync.ts";
import { EMPTY_SCENE_DATA, useSceneStore, type SceneData } from "./store.ts";
import { getSupabase } from "./supabaseClient.ts";
import { acceptReloadedDocument, mergeLoadResult, type TableChange } from "./sync.ts";

export type DataAccess = "unknown" | "granted" | "denied";

export type SceneSync = {
  access: DataAccess;
  /** Runs a full load again, e.g. from the retry button of the error state. */
  retry: () => void;
};

const currentScene = (): SceneData => useSceneStore.getState();

/**
 * Keeps the scene store in sync with Supabase for as long as the component is mounted. The channel is
 * subscribed first and a full load runs on every SUBSCRIBED; changes arriving during a load are buffered
 * and replayed on top of its result, and only the newest load is applied.
 */
export function useSceneSync(): SceneSync {
  const [access, setAccess] = useState<DataAccess>("unknown");
  const loadRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const client = getSupabase();
    let isStopped = false;
    let latestLoadId = 0;
    let isLoading = false;
    let buffered: TableChange[] = [];

    const reloadDocument = async (): Promise<void> => {
      try {
        const document = await loadDocument(client, currentScene().appState?.activeDocumentId ?? null);
        if (!isStopped) useSceneStore.setState(acceptReloadedDocument(currentScene(), document));
      } catch (error) {
        console.error("Reloading the active document failed", error);
      }
    };

    const applyLoaded = (loaded: SceneData): void => {
      const merged = mergeLoadResult(loaded, buffered);
      buffered = [];
      isLoading = false;
      useSceneStore.setState(merged.state);
      if (merged.needsDocumentReload) void reloadDocument();
    };

    const load = async (): Promise<void> => {
      const loadId = ++latestLoadId;
      isLoading = true;
      buffered = [];
      try {
        const result = await loadScene(client);
        if (isStopped || loadId !== latestLoadId) return;
        if (!result) {
          isLoading = false;
          setAccess("denied");
          useSceneStore.setState({ ...EMPTY_SCENE_DATA, status: "ready" });
          return;
        }
        setAccess("granted");
        applyLoaded({ ...result, status: "ready", error: null });
      } catch (error) {
        console.error("Loading the scene failed", error);
        if (isStopped || loadId !== latestLoadId) return;
        isLoading = false;
        buffered = [];
        useSceneStore.getState().setError(de.data.loadFailed);
      }
    };
    loadRef.current = () => {
      useSceneStore.getState().setLoading();
      void load();
    };

    const handleChange = (tableChange: TableChange): void => {
      if (isLoading) {
        buffered.push(tableChange);
        return;
      }
      const result = mergeLoadResult(currentScene(), [tableChange]);
      useSceneStore.setState(result.state);
      if (result.needsDocumentReload) void reloadDocument();
    };

    restoreCachedScene();
    useSceneStore.getState().setLoading();
    const stopCache = startCachePersistence();
    const stopRealtime = startRealtimeSync(client, {
      onChange: (tableChange) => {
        try {
          handleChange(tableChange);
        } catch (error) {
          console.error(`Ignoring invalid ${tableChange.table} change`, error);
        }
      },
      onSubscribed: () => void load(),
    });

    return () => {
      isStopped = true;
      stopRealtime();
      stopCache();
    };
  }, []);

  const retry = useCallback(() => loadRef.current(), []);
  return { access, retry };
}
