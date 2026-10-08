import { appStateSchema } from "@app/core";
import { useSceneStore } from "./store.ts";

/** Fixture mode exists in dev builds only; the constant folds to false in production and the branch is removed. */
export function isFixtureMode(): boolean {
  if (!import.meta.env.DEV) return false;
  return /[?&]fixture=seed(&|$)/.test(window.location.hash);
}

/** Fills the store from the core seed data (documents, assets, materials) without any network access. */
export async function loadFixtureScene(): Promise<void> {
  if (!import.meta.env.DEV) return;
  const { SEED_DOCUMENT, SEED_ASSETS, SEED_MATERIALS } = await import("@app/core/seed");
  const appState = appStateSchema.parse({
    mode: "editor",
    activeDocumentId: SEED_DOCUMENT.id,
    activeAssetId: null,
    editorView: "dollhouse",
    renderMode: "work",
    photoResolution: { width: 1920, height: 1080 },
    camera: null,
    focusId: null,
    selection: [],
    workshopCamera: "perspective",
    workshopLight: "studio",
    measurementOverlay: [],
    aiBusyUntil: null,
  });
  useSceneStore.getState().setSceneData({
    appState,
    document: { ...SEED_DOCUMENT, version: 1, updatedAt: new Date(0).toISOString() },
    assets: new Map(SEED_ASSETS.map((asset) => [asset.id, asset])),
    materials: new Map(SEED_MATERIALS.map((material) => [material.id, material])),
    status: "ready",
    error: null,
  });
}
