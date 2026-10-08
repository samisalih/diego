import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppState, Asset, Material } from "@app/core";
import { appStateFromRow, assetFromRow, documentFromRow, materialFromRow, type DbRow, type PlannerDocument } from "./mappers.ts";

const APP_STATE_ROW_ID = 1;

export type LoadedScene = {
  appState: AppState;
  document: PlannerDocument | null;
  assets: Map<string, Asset>;
  materials: Map<string, Material>;
};

/** `null` means the session can read no app_state row, i.e. it is not the owner. */
export type SceneLoadResult = LoadedScene | null;

async function selectLiveRows(client: SupabaseClient, table: "assets" | "materials"): Promise<DbRow[]> {
  const { data, error } = await client.from(table).select("*").is("deleted_at", null);
  if (error) throw new Error(`Loading ${table} failed: ${error.message}`);
  return data as DbRow[];
}

async function loadAppState(client: SupabaseClient): Promise<AppState | null> {
  const { data, error } = await client.from("app_state").select("*").eq("id", APP_STATE_ROW_ID).maybeSingle();
  if (error) throw new Error(`Loading app_state failed: ${error.message}`);
  return data ? appStateFromRow(data as DbRow) : null;
}

/** Loads the active document row; null when none is active or it was deleted. */
export async function loadDocument(client: SupabaseClient, documentId: string | null): Promise<PlannerDocument | null> {
  if (!documentId) return null;
  const { data, error } = await client.from("documents").select("*").eq("id", documentId).maybeSingle();
  if (error) throw new Error(`Loading documents failed: ${error.message}`);
  return data ? documentFromRow(data as DbRow) : null;
}

/** Maps rows one by one so a single invalid row is reported without taking the whole scene down. */
function mapRows<T extends { id: string }>(rows: DbRow[], map: (row: DbRow) => T | null): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    try {
      const mapped = map(row);
      if (mapped) result.set(mapped.id, mapped);
    } catch (error) {
      console.error(`Skipping invalid row "${String(row.id)}"`, error);
    }
  }
  return result;
}

/** Initial load: app_state, then the active document, then all non-deleted assets and materials. */
export async function loadScene(client: SupabaseClient): Promise<SceneLoadResult> {
  const appState = await loadAppState(client);
  if (!appState) return null;
  const [document, assetRows, materialRows] = await Promise.all([
    loadDocument(client, appState.activeDocumentId),
    selectLiveRows(client, "assets"),
    selectLiveRows(client, "materials"),
  ]);
  return {
    appState,
    document,
    assets: mapRows(assetRows, assetFromRow),
    materials: mapRows(materialRows, materialFromRow),
  };
}
