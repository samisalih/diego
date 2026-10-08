import { platform } from "../platform/index.ts";
import { parseCachedScene } from "./sync.ts";
import { EMPTY_SCENE_DATA, useSceneStore, type SceneData } from "./store.ts";

// Bump the version when the snapshot shape changes; old snapshots are then simply never read.
const CACHE_KEY = "scene-data:v1";
const LEGACY_CACHE_KEY = "scene-data";
const WRITE_DELAY_MS = 500;

function toSnapshot(state: SceneData) {
  if (state.status !== "ready" || !state.appState) return null;
  return {
    appState: state.appState,
    document: state.document,
    assets: [...state.assets.values()],
    materials: [...state.materials.values()],
  };
}

/** Puts the cached snapshot into the store as a placeholder until the first network load lands. */
export function restoreCachedScene(): void {
  platform.cache.remove(LEGACY_CACHE_KEY);
  const scene = parseCachedScene(platform.cache.get<unknown>(CACHE_KEY));
  if (scene) useSceneStore.getState().setSceneData(scene);
  else platform.cache.remove(CACHE_KEY);
}

/** Drops the cache and the in-memory scene; runs on every SIGNED_OUT event. */
export function resetSceneOnSignOut(): void {
  platform.cache.remove(CACHE_KEY);
  useSceneStore.getState().setSceneData(EMPTY_SCENE_DATA);
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
