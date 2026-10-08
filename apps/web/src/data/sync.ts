import {
  appStateSchema,
  assetSchema,
  documentSchema,
  materialSchema,
  safeParseWithIssues,
  type Asset,
  type Material,
} from "@app/core";
import type { PlannerDocument } from "./mappers.ts";
import {
  applyAppStateChange,
  applyAssetChange,
  applyDocumentChange,
  applyMaterialChange,
  type RowChange,
  type SceneData,
  type WithDocument,
} from "./store.ts";

/** A Realtime change tagged with the table it came from. */
export type TableChange = {
  table: "documents" | "assets" | "materials" | "app_state";
  change: RowChange;
};

function applyTableChange(state: SceneData, { table, change }: TableChange): { state: SceneData; needsDocumentReload: boolean } {
  switch (table) {
    case "documents":
      return { state: applyDocumentChange(state, change), needsDocumentReload: false };
    case "assets":
      return { state: applyAssetChange(state, change), needsDocumentReload: false };
    case "materials":
      return { state: applyMaterialChange(state, change), needsDocumentReload: false };
    case "app_state":
      return applyAppStateChange(state, change);
  }
}

/**
 * Replays the changes that arrived while a load was in flight on top of the loaded state, in arrival
 * order. Changes that are older than what was loaded are dropped by the reducers' version checks.
 */
export function mergeLoadResult(loaded: SceneData, buffered: TableChange[]): { state: SceneData; needsDocumentReload: boolean } {
  let state = loaded;
  let needsDocumentReload = false;
  for (const tableChange of buffered) {
    try {
      const result = applyTableChange(state, tableChange);
      state = result.state;
      needsDocumentReload ||= result.needsDocumentReload;
    } catch (error) {
      // One broken row must not fail the whole load; the loaded state stays as it is for that row.
      console.error(`Skipping invalid buffered ${tableChange.table} change`, error);
    }
  }
  return { state, needsDocumentReload };
}

/**
 * Applies the result of loading `requestedId`, only while that id is still the active document and not
 * older than the same document already in the state. A `null` result (no such document) clears it.
 */
export function acceptReloadedDocument<S extends SceneData>(state: S, requestedId: string, loaded: PlannerDocument | null): WithDocument<S> {
  if (requestedId !== state.appState?.activeDocumentId) return state;
  if (loaded === null) return state.document ? { ...state, document: null } : state;
  if (loaded.id !== requestedId) return state;
  if (state.document?.id === loaded.id && state.document.version > loaded.version) return state;
  return { ...state, document: loaded };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function parseEach<T>(values: unknown, parse: (value: unknown) => T | null): T[] | null {
  if (!Array.isArray(values)) return null;
  const parsed = values.map(parse);
  return parsed.every((value) => value !== null) ? (parsed as T[]) : null;
}

function parseDocument(raw: unknown): PlannerDocument | null {
  if (!isRecord(raw) || typeof raw.version !== "number" || typeof raw.updatedAt !== "string") return null;
  const result = safeParseWithIssues(documentSchema, raw);
  return result.ok ? { ...result.value, version: raw.version, updatedAt: raw.updatedAt } : null;
}

function parseAsset(raw: unknown): (Asset & { version: number }) | null {
  const result = safeParseWithIssues(assetSchema, raw);
  const version = isRecord(raw) ? raw.version : undefined;
  return result.ok && typeof version === "number" ? { ...result.value, version } : null;
}

function parseMaterial(raw: unknown): Material | null {
  const result = safeParseWithIssues(materialSchema, raw);
  return result.ok ? result.value : null;
}

/**
 * Reads the cached snapshot `{ appState, document, assets, materials }` back into scene data; every
 * part is validated with the core schemas and anything invalid discards the whole snapshot.
 */
export function parseCachedScene(raw: unknown): SceneData | null {
  if (!isRecord(raw)) return null;
  const appState = safeParseWithIssues(appStateSchema, raw.appState);
  const assets = parseEach(raw.assets, parseAsset);
  const materials = parseEach(raw.materials, parseMaterial);
  const document = raw.document === null ? null : parseDocument(raw.document);
  if (!appState.ok || !assets || !materials || (raw.document !== null && document === null)) return null;
  return {
    appState: appState.value,
    document,
    assets: new Map(assets.map((asset) => [asset.id, asset])),
    materials: new Map(materials.map((material) => [material.id, material])),
    status: "loading",
    error: null,
  };
}
