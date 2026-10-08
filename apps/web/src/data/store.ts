import type { AppState, Asset, Material } from "@app/core";
import { create } from "zustand";
import { appStateFromRow, assetFromRow, documentFromRow, materialFromRow, type DbRow, type PlannerDocument } from "./mappers.ts";

/** Everything the scene renders from; plain data only. */
export type SceneData = {
  appState: AppState | null;
  document: PlannerDocument | null;
  assets: Map<string, Asset>;
  materials: Map<string, Material>;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

/** A Realtime event: delete events only carry the primary key, upserts carry the full row. */
export type RowChange = { type: "upsert" | "delete"; row: DbRow };

/** Starting point of the store before anything is loaded. */
export const EMPTY_SCENE_DATA: SceneData = {
  appState: null,
  document: null,
  assets: new Map(),
  materials: new Map(),
  status: "idle",
  error: null,
};

function upsertOrRemove<T>(map: Map<string, T>, id: string, value: T | null): Map<string, T> {
  const next = new Map(map);
  if (value === null) next.delete(id);
  else next.set(id, value);
  return next;
}

/** The state type after a document change: the document may be set or cleared whatever it was before. */
type WithDocument<S extends SceneData> = Omit<S, "document"> & Pick<SceneData, "document">;

/** Applies a `documents` change; only the active document is kept and stale versions are ignored. */
export function applyDocumentChange<S extends SceneData>(state: S, change: RowChange): WithDocument<S> {
  const id = change.row.id as string;
  if (id !== state.appState?.activeDocumentId) return state;
  if (change.type === "delete") return { ...state, document: null };
  const incoming = documentFromRow(change.row);
  if (incoming === null) return { ...state, document: null };
  if (state.document && incoming.version < state.document.version) return state;
  return { ...state, document: incoming };
}

/** Applies an `assets` change (upsert, soft delete or delete). */
export function applyAssetChange<S extends SceneData>(state: S, change: RowChange): S {
  const id = change.row.id as string;
  const asset = change.type === "delete" ? null : assetFromRow(change.row);
  return { ...state, assets: upsertOrRemove(state.assets, id, asset) };
}

/** Applies a `materials` change (upsert, soft delete or delete). */
export function applyMaterialChange<S extends SceneData>(state: S, change: RowChange): S {
  const id = change.row.id as string;
  const material = change.type === "delete" ? null : materialFromRow(change.row);
  return { ...state, materials: upsertOrRemove(state.materials, id, material) };
}

/** Applies an `app_state` change; the caller reloads the document when `needsDocumentReload` is set. */
export function applyAppStateChange<S extends SceneData>(state: S, change: RowChange): { state: S; needsDocumentReload: boolean } {
  if (change.type === "delete") return { state, needsDocumentReload: false };
  const appState = appStateFromRow(change.row);
  const needsDocumentReload = appState.activeDocumentId !== (state.appState?.activeDocumentId ?? undefined);
  return { state: { ...state, appState }, needsDocumentReload };
}

type SceneActions = {
  applyDocumentChange: (change: RowChange) => void;
  applyAssetChange: (change: RowChange) => void;
  applyMaterialChange: (change: RowChange) => void;
  /** Returns whether the caller must reload the active document. */
  applyAppStateChange: (change: RowChange) => boolean;
  /** Replaces the whole scene data, e.g. after the initial load or from the cache. */
  setSceneData: (data: Partial<SceneData>) => void;
  setLoading: () => void;
  setError: (message: string) => void;
};

/** The single zustand store holding SceneData; actions wrap the pure reducers above. */
export const useSceneStore = create<SceneData & SceneActions>()((set, get) => ({
  ...EMPTY_SCENE_DATA,
  applyDocumentChange: (change) => set((state) => applyDocumentChange(state, change)),
  applyAssetChange: (change) => set((state) => applyAssetChange(state, change)),
  applyMaterialChange: (change) => set((state) => applyMaterialChange(state, change)),
  applyAppStateChange: (change) => {
    const result = applyAppStateChange(get(), change);
    set(result.state);
    return result.needsDocumentReload;
  },
  setSceneData: (data) => set(data),
  setLoading: () => set({ status: "loading", error: null }),
  setError: (message) => set({ status: "error", error: message }),
}));
