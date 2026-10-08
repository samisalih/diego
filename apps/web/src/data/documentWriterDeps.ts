import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentWriterDeps } from "./documentWriter.ts";
import { loadDocument } from "./loadScene.ts";
import { useSceneStore } from "./store.ts";

type DocumentSource = Pick<DocumentWriterDeps, "getDocument" | "getAssets" | "applyLocal">;

/** Reads and writes the active document in the scene store. */
export function createStoreDocumentSource(): DocumentSource {
  return {
    getDocument: () => useSceneStore.getState().document,
    getAssets: () => [...useSceneStore.getState().assets.values()],
    applyLocal: (document) => useSceneStore.getState().setSceneData({ document }),
  };
}

function unwrap<T>(response: { data: unknown; error: unknown }): T {
  if (response.error) throw response.error;
  return response.data as T;
}

/** Real deps: the scene store plus the document write functions of the database. */
export function createSupabaseDocumentWriterDeps(client: SupabaseClient): DocumentWriterDeps {
  const source = createStoreDocumentSource();
  return {
    ...source,
    save: async ({ id, expectedVersion, content }) =>
      unwrap<number>(
        await client.rpc("save_document", {
          p_id: id,
          p_expected_version: expectedVersion,
          p_name: content.name,
          p_apartment: content.apartment,
          p_items: content.items,
          p_lighting: content.lighting,
          p_created_by: "user",
        }),
      ),
    reload: () => loadDocument(client, source.getDocument()?.id ?? null),
    undoRemote: async ({ id, expectedVersion }) =>
      unwrap<number | null>(await client.rpc("undo_document", { p_id: id, p_expected_version: expectedVersion })),
    redoRemote: async ({ id, expectedVersion }) =>
      unwrap<number | null>(await client.rpc("redo_document", { p_id: id, p_expected_version: expectedVersion })),
  };
}

/** Fixture mode: edits stay in the store, saving just bumps the version, undo / redo do nothing. */
export function createLocalOnlyDocumentWriterDeps(): DocumentWriterDeps {
  const source = createStoreDocumentSource();
  return {
    ...source,
    save: async ({ expectedVersion }) => expectedVersion + 1,
    reload: async () => source.getDocument(),
    undoRemote: async () => null,
    redoRemote: async () => null,
  };
}
