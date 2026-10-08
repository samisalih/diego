import type { AppState, Asset, Material } from "@app/core";
import { platform } from "../platform/index.ts";
import type { PlannerDocument } from "./mappers.ts";
import { useSceneStore, type SceneData } from "./store.ts";

const CACHE_KEY = "scene-data";
const WRITE_DELAY_MS = 500;

type SceneSnapshot = {
  appState: AppState;
  document: PlannerDocument | null;
  assets: Asset[];
  materials: Material[];
};

function toSnapshot(state: SceneData): SceneSnapshot | null {
  if (state.status !== "ready" || !state.appState) return null;
  return {
    appState: state.appState,
    document: state.document,
    assets: [...state.assets.values()],
    materials: [...state.materials.values()],
  };
}

/** Puts the last cached snapshot into the store so something is on screen while the network load runs. */
export function restoreCachedScene(): void {
  const snapshot = platform.cache.get<SceneSnapshot>(CACHE_KEY);
  if (!snapshot) return;
  useSceneStore.getState().setSceneData({
    appState: snapshot.appState,
    document: snapshot.document,
    assets: new Map(snapshot.assets.map((asset) => [asset.id, asset])),
    materials: new Map(snapshot.materials.map((material) => [material.id, material])),
  });
}

export function clearCachedScene(): void {
  platform.cache.remove(CACHE_KEY);
}

/** Writes the snapshot after every change of the loaded scene (debounced); returns the stop function. */
export function startCachePersistence(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = useSceneStore.subscribe((state, previous) => {
    const changed =
      state.appState !== previous.appState ||
      state.document !== previous.document ||
      state.assets !== previous.assets ||
      state.materials !== previous.materials ||
      state.status !== previous.status;
    if (!changed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const snapshot = toSnapshot(useSceneStore.getState());
      if (snapshot) platform.cache.set(CACHE_KEY, snapshot);
    }, WRITE_DELAY_MS);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
