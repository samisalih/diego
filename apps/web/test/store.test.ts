import { SEED_ASSETS, SEED_DOCUMENT, SEED_MATERIALS } from "../../../packages/core/src/seed/index.ts";
import { describe, expect, it } from "vitest";
import { appStateFromRow, assetFromRow, documentFromRow, materialFromRow } from "../src/data/mappers.ts";
import {
  applyAppStateChange,
  applyAssetChange,
  applyDocumentChange,
  applyMaterialChange,
} from "../src/data/store.ts";
import { appStateRow, assetRow, documentRow, materialRow, OAK_FLOOR, SOFA_ASSET } from "./helpers/rows.ts";

// SceneData per docs/specs/work-render.md section 2.2.
function readyState(documentVersion = 3) {
  return {
    appState: appStateFromRow(appStateRow()),
    document: documentFromRow(documentRow({ version: documentVersion })),
    assets: new Map(SEED_ASSETS.map((asset) => [asset.id, assetFromRow(assetRow(asset))!])),
    materials: new Map(SEED_MATERIALS.map((material) => [material.id, materialFromRow(materialRow(material))!])),
    status: "ready" as const,
    error: null as string | null,
  };
}

const movedItems = (x: number) => SEED_DOCUMENT.items.map((item) => (item.id === "item_sofa" ? { ...item, x } : item));
const sofaX = (state: ReturnType<typeof readyState>) => state.document?.items.find((item) => item.id === "item_sofa")?.x;

describe("data/store reducers", () => {
  describe("applyDocumentChange", () => {
    // Red if upsert ignores new content of the active document.
    it("replaces the active document with a newer version", () => {
      const next = applyDocumentChange(readyState(3), { type: "upsert", row: documentRow({ version: 4, items: movedItems(3.3) }) });
      expect(sofaX(next)).toBe(3.3);
      expect(next.document?.version).toBe(4);
    });

    // Red if the comparison is >= instead of > (spec 2.2: strictly greater; the echo of a local save has the same version).
    it("ignores an event with the same version", () => {
      const state = readyState(3);
      const next = applyDocumentChange(state, { type: "upsert", row: documentRow({ version: 3, items: movedItems(4) }) });
      expect(sofaX(next)).toBe(SEED_DOCUMENT.items.find((item) => item.id === "item_sofa")!.x);
      expect(next.document?.version).toBe(3);
    });

    // Red if the echo of an earlier save (R1 at N+1) overwrites the optimistic content R2 of a follow-up commit
    // (R2 is applied locally at version N+1 before its own save returns) - the flicker of spec 2.2.
    it("keeps the optimistic content when the echo of the previous save arrives at the same version", () => {
      const optimistic = { ...readyState(4).document!, items: movedItems(2.5) };
      const state = { ...readyState(4), document: optimistic };
      const next = applyDocumentChange(state, { type: "upsert", row: documentRow({ version: 4, items: movedItems(1.5) }) });
      expect(sofaX(next)).toBe(2.5);
      expect(next.document).toBe(optimistic);
    });

    // Red if stale events overwrite newer state.
    it("ignores a stale event with a lower version", () => {
      const state = readyState(5);
      const next = applyDocumentChange(state, { type: "upsert", row: documentRow({ version: 4, items: movedItems(9) }) });
      expect(next.document?.version).toBe(5);
      expect(sofaX(next)).toBe(SEED_DOCUMENT.items.find((item) => item.id === "item_sofa")!.x);
    });

    // Red if any document id is accepted.
    it("ignores a document that is not the active one", () => {
      const state = readyState(1);
      const next = applyDocumentChange(state, { type: "upsert", row: documentRow({ id: "doc_other", version: 99, name: "Other" }) });
      expect(next.document?.id).toBe(SEED_DOCUMENT.id);
      expect(next.document?.name).toBe(SEED_DOCUMENT.name);
    });

    // Red if the reducer adopts documents although no app state tells which one is active.
    it("ignores upserts while no app state is loaded", () => {
      const state = { ...readyState(1), appState: null, document: null };
      expect(applyDocumentChange(state, { type: "upsert", row: documentRow({ version: 2 }) }).document).toBeNull();
    });

    // Red if the first load of the active document via an event is dropped.
    it("sets the active document when none is loaded yet", () => {
      const state = { ...readyState(1), document: null };
      expect(applyDocumentChange(state, { type: "upsert", row: documentRow({ version: 2 }) }).document?.version).toBe(2);
    });

    // Red if soft-deleting does not clear the document.
    it("clears the document on soft delete", () => {
      const next = applyDocumentChange(readyState(3), { type: "upsert", row: documentRow({ version: 4, deleted_at: "2026-10-08T11:00:00+00:00" }) });
      expect(next.document).toBeNull();
    });

    // Red if a hard delete event (which only carries the primary key) does not clear the document.
    it("clears the document on delete of the active document", () => {
      expect(applyDocumentChange(readyState(3), { type: "delete", row: { id: SEED_DOCUMENT.id } }).document).toBeNull();
    });

    // Red if deleting an unrelated document clears the active one.
    it("keeps the document on delete of another document", () => {
      expect(applyDocumentChange(readyState(3), { type: "delete", row: { id: "doc_other" } }).document?.id).toBe(SEED_DOCUMENT.id);
    });

    // Red if versions are compared across ids: the active document B (version 1) must replace the stale A (version 5).
    it("compares versions only when the ids match", () => {
      const state = {
        ...readyState(5),
        appState: appStateFromRow(appStateRow({ active_document_id: "doc_b" })),
      };
      const next = applyDocumentChange(state, { type: "upsert", row: documentRow({ id: "doc_b", version: 1, name: "B" }) });
      expect(next.document?.id).toBe("doc_b");
      expect(next.document?.version).toBe(1);
    });

    // Red if the reducer mutates the previous state (breaks change detection of the store).
    it("does not mutate the previous state", () => {
      const state = readyState(3);
      const before = structuredClone(state.document);
      applyDocumentChange(state, { type: "upsert", row: documentRow({ version: 4, items: movedItems(7) }) });
      expect(state.document).toEqual(before);
    });

    // Red if unrelated parts of the state are dropped.
    it("leaves assets, materials and status untouched", () => {
      const state = readyState(3);
      const next = applyDocumentChange(state, { type: "upsert", row: documentRow({ version: 4 }) });
      expect(next.assets).toEqual(state.assets);
      expect(next.materials).toEqual(state.materials);
      expect(next.status).toBe("ready");
    });
  });

  describe("applyAssetChange", () => {
    // Red if upsert does not replace by id.
    it("upserts an asset by id", () => {
      const state = readyState();
      const next = applyAssetChange(state, { type: "upsert", row: assetRow(SOFA_ASSET, { name: "Sofa XL", version: 2 }) });
      expect(next.assets.get("asset_sofa")?.name).toBe("Sofa XL");
      expect(next.assets.size).toBe(state.assets.size);
    });

    // Red if new ids are not added.
    it("adds an asset with a new id", () => {
      const state = readyState();
      const next = applyAssetChange(state, { type: "upsert", row: assetRow({ ...SOFA_ASSET, id: "asset_new" }) });
      expect(next.assets.has("asset_new")).toBe(true);
      expect(next.assets.size).toBe(state.assets.size + 1);
    });

    // Red if the previous Map is mutated in place.
    it("returns a new map and leaves the previous one untouched", () => {
      const state = readyState();
      const next = applyAssetChange(state, { type: "upsert", row: assetRow(SOFA_ASSET, { name: "Changed" }) });
      expect(next.assets).not.toBe(state.assets);
      expect(state.assets.get("asset_sofa")?.name).toBe(SOFA_ASSET.name);
    });

    // Red if soft-deleted rows stay in the map.
    it("removes an asset on soft delete", () => {
      const next = applyAssetChange(readyState(), { type: "upsert", row: assetRow(SOFA_ASSET, { deleted_at: "2026-10-08T11:00:00+00:00" }) });
      expect(next.assets.has("asset_sofa")).toBe(false);
    });

    // Red if hard deletes are not handled.
    it("removes an asset on delete", () => {
      const next = applyAssetChange(readyState(), { type: "delete", row: { id: "asset_sofa" } });
      expect(next.assets.has("asset_sofa")).toBe(false);
      expect(next.assets.size).toBe(SEED_ASSETS.length - 1);
    });
  });

  describe("applyMaterialChange", () => {
    // Red if a colour change from the database does not reach the map.
    it("upserts a material by id", () => {
      const next = applyMaterialChange(readyState(), { type: "upsert", row: materialRow(OAK_FLOOR, { fallback_color: "#112233" }) });
      expect(next.materials.get("mat_oak_floorboards")?.fallbackColor).toBe("#112233");
      expect(next.materials.size).toBe(SEED_MATERIALS.length);
    });

    // Red if soft-deleted rows stay in the map.
    it("removes a material on soft delete", () => {
      const next = applyMaterialChange(readyState(), { type: "upsert", row: materialRow(OAK_FLOOR, { deleted_at: "2026-10-08T11:00:00+00:00" }) });
      expect(next.materials.has("mat_oak_floorboards")).toBe(false);
    });

    // Red if hard deletes are not handled.
    it("removes a material on delete", () => {
      const state = readyState();
      const next = applyMaterialChange(state, { type: "delete", row: { id: "mat_tiles" } });
      expect(next.materials.has("mat_tiles")).toBe(false);
      expect(state.materials.has("mat_tiles")).toBe(true);
    });
  });

  describe("applyAppStateChange", () => {
    // Red if the flag is false when the active document switches.
    it("requests a document reload when the active document changed", () => {
      const result = applyAppStateChange(readyState(), { type: "upsert", row: appStateRow({ active_document_id: "doc_other" }) });
      expect(result.needsDocumentReload).toBe(true);
      expect(result.state.appState?.activeDocumentId).toBe("doc_other");
    });

    // Red if the flag is always true.
    it("does not request a reload when only other fields changed", () => {
      const result = applyAppStateChange(readyState(), { type: "upsert", row: appStateRow({ selection: ["item_sofa"], focus_id: "item_sofa" }) });
      expect(result.needsDocumentReload).toBe(false);
      expect(result.state.appState?.selection).toEqual(["item_sofa"]);
      expect(result.state.appState?.focusId).toBe("item_sofa");
    });

    // Red if the very first app state does not trigger loading the active document.
    it("requests a reload when the first app state names an active document", () => {
      const state = { ...readyState(), appState: null, document: null };
      expect(applyAppStateChange(state, { type: "upsert", row: appStateRow() }).needsDocumentReload).toBe(true);
    });

    // Red if the active document is cleared to null by the app state.
    it("requests a reload when the active document is unset", () => {
      const result = applyAppStateChange(readyState(), { type: "upsert", row: appStateRow({ active_document_id: null }) });
      expect(result.needsDocumentReload).toBe(true);
      expect(result.state.appState?.activeDocumentId).toBeNull();
    });

    // Red if the old document stays in place after the active document switched (the reload fills the new one).
    it("clears the document when the active document changed", () => {
      const result = applyAppStateChange(readyState(3), { type: "upsert", row: appStateRow({ active_document_id: "doc_other" }) });
      expect(result.state.document).toBeNull();
    });

    // Red if the document is cleared although the active document did not change.
    it("keeps the document when the active document did not change", () => {
      const result = applyAppStateChange(readyState(3), { type: "upsert", row: appStateRow({ selection: ["item_sofa"] }) });
      expect(result.state.document?.id).toBe(SEED_DOCUMENT.id);
    });
  });
});
