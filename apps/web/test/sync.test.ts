import type { Asset } from "@app/core";
import { SEED_ASSETS, SEED_DOCUMENT, SEED_MATERIALS } from "../../../packages/core/src/seed/index.ts";
import { describe, expect, it } from "vitest";
import { appStateFromRow, assetFromRow, documentFromRow, materialFromRow } from "../src/data/mappers.ts";
import { acceptReloadedDocument, mergeLoadResult, parseCachedScene, type TableChange } from "../src/data/sync.ts";
import { appStateRow, assetRow, documentRow, materialRow, OAK_FLOOR, SOFA_ASSET } from "./helpers/rows.ts";

function loadedState(documentVersion = 3) {
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
const sofaX = (state: { document: { items: Array<{ id: string; x: number }> } | null }) => state.document?.items.find((item) => item.id === "item_sofa")?.x;
const SEED_SOFA_X = SEED_DOCUMENT.items.find((item) => item.id === "item_sofa")!.x;

describe("mergeLoadResult", () => {
  // Red if an empty buffer changes the loaded state or sets the reload flag.
  it("returns the loaded state unchanged when nothing was buffered", () => {
    const loaded = loadedState();
    const result = mergeLoadResult(loaded, []);
    expect(result.state).toEqual(loaded);
    expect(result.needsDocumentReload).toBe(false);
  });

  // Red if a document event that arrived during the load and is newer than the loaded one is dropped.
  it("lets a buffered document event newer than the loaded document win", () => {
    const buffered: TableChange[] = [{ table: "documents", change: { type: "upsert", row: documentRow({ version: 4, items: movedItems(3.3) }) } }];
    const result = mergeLoadResult(loadedState(3), buffered);
    expect(sofaX(result.state)).toBe(3.3);
    expect(result.state.document?.version).toBe(4);
  });

  // Red if an older buffered event overwrites the freshly loaded document.
  it("ignores a buffered document event older than the loaded document", () => {
    const buffered: TableChange[] = [{ table: "documents", change: { type: "upsert", row: documentRow({ version: 2, items: movedItems(9) }) } }];
    const result = mergeLoadResult(loadedState(3), buffered);
    expect(sofaX(result.state)).toBe(SEED_SOFA_X);
    expect(result.state.document?.version).toBe(3);
  });

  // Red if buffered events are not replayed in arrival order (the last one must win).
  it("replays buffered events in arrival order", () => {
    const buffered: TableChange[] = [
      { table: "documents", change: { type: "upsert", row: documentRow({ version: 4, items: movedItems(4) }) } },
      { table: "documents", change: { type: "upsert", row: documentRow({ version: 5, items: movedItems(5) }) } },
      { table: "assets", change: { type: "upsert", row: assetRow(SOFA_ASSET, { name: "First" }) } },
      { table: "assets", change: { type: "upsert", row: assetRow(SOFA_ASSET, { name: "Second" }) } },
    ];
    const result = mergeLoadResult(loadedState(3), buffered);
    expect(sofaX(result.state)).toBe(5);
    expect(result.state.assets.get("asset_sofa")?.name).toBe("Second");
  });

  // Red if materials or assets are not routed to their own reducer by table.
  it("routes asset and material changes to their maps", () => {
    const loaded = loadedState();
    const buffered: TableChange[] = [
      { table: "materials", change: { type: "upsert", row: materialRow(OAK_FLOOR, { fallback_color: "#112233" }) } },
      { table: "materials", change: { type: "delete", row: { id: "mat_tiles" } } },
      { table: "assets", change: { type: "delete", row: { id: "asset_sofa" } } },
    ];
    const { state } = mergeLoadResult(loaded, buffered);
    expect(state.materials.get("mat_oak_floorboards")?.fallbackColor).toBe("#112233");
    expect(state.materials.has("mat_tiles")).toBe(false);
    expect(state.assets.has("asset_sofa")).toBe(false);
  });

  // Red if a buffered switch of the active document is not reported or leaves the old document in place.
  it("reports a reload and clears the document when a buffered app_state switches the active document", () => {
    const buffered: TableChange[] = [{ table: "app_state", change: { type: "upsert", row: appStateRow({ active_document_id: "doc_other" }) } }];
    const result = mergeLoadResult(loadedState(), buffered);
    expect(result.needsDocumentReload).toBe(true);
    expect(result.state.appState?.activeDocumentId).toBe("doc_other");
    expect(result.state.document).toBeNull();
  });

  // Red if every buffered app_state event requests a reload.
  it("does not request a reload for an app_state event that keeps the active document", () => {
    const buffered: TableChange[] = [{ table: "app_state", change: { type: "upsert", row: appStateRow({ selection: ["item_sofa"] }) } }];
    const result = mergeLoadResult(loadedState(), buffered);
    expect(result.needsDocumentReload).toBe(false);
    expect(result.state.appState?.selection).toEqual(["item_sofa"]);
    expect(result.state.document?.id).toBe(SEED_DOCUMENT.id);
  });

  // Red if the loaded state is mutated while replaying.
  it("does not mutate the loaded state", () => {
    const loaded = loadedState();
    const snapshot = structuredClone({ ...loaded, assets: [...loaded.assets], materials: [...loaded.materials] });
    mergeLoadResult(loaded, [
      { table: "documents", change: { type: "upsert", row: documentRow({ version: 9, items: movedItems(8) }) } },
      { table: "assets", change: { type: "delete", row: { id: "asset_sofa" } } },
    ]);
    expect(loaded.document).toEqual(snapshot.document);
    expect([...loaded.assets]).toEqual(snapshot.assets);
  });
});

describe("acceptReloadedDocument", () => {
  const reloaded = (version: number, id = SEED_DOCUMENT.id) => documentFromRow(documentRow({ id, version, items: movedItems(6) }))!;

  // Red if the document loaded after a switch is not applied when nothing is in the state yet.
  it("applies a loaded document that matches the active document id", () => {
    const state = { ...loadedState(), document: null };
    const next = acceptReloadedDocument(state, reloaded(1));
    expect(next.document?.id).toBe(SEED_DOCUMENT.id);
    expect(sofaX(next)).toBe(6);
  });

  // Red if a document for a no-longer-active id (the user switched again meanwhile) is applied.
  it("returns the state unchanged when the id is not the active document", () => {
    const state = { ...loadedState(), document: null };
    expect(acceptReloadedDocument(state, reloaded(1, "doc_other"))).toBe(state);
  });

  // Red if there is no active document at all but a document is accepted.
  it("returns the state unchanged when no document is active", () => {
    const state = { ...loadedState(), appState: appStateFromRow(appStateRow({ active_document_id: null })), document: null };
    expect(acceptReloadedDocument(state, reloaded(1))).toBe(state);
  });

  // Red if a reload overwrites a newer version of the same document that a Realtime event delivered meanwhile.
  it("returns the state unchanged when the loaded document is older than the same document in the state", () => {
    const state = loadedState(5);
    expect(acceptReloadedDocument(state, reloaded(4))).toBe(state);
  });

  // Red if equal or newer versions of the same document are rejected.
  it("accepts the same or a newer version of the same document", () => {
    expect(sofaX(acceptReloadedDocument(loadedState(5), reloaded(5)))).toBe(6);
    expect(acceptReloadedDocument(loadedState(5), reloaded(6)).document?.version).toBe(6);
  });

  // Red if the version comparison also applies across ids (a switch to a document with a lower version would stick on the old one).
  it("replaces a document with a different id regardless of the version", () => {
    const other = documentFromRow(documentRow({ id: "doc_other", version: 9 }))!;
    const state = { ...loadedState(), appState: appStateFromRow(appStateRow({ active_document_id: SEED_DOCUMENT.id })), document: other };
    const next = acceptReloadedDocument(state, reloaded(1));
    expect(next.document?.id).toBe(SEED_DOCUMENT.id);
    expect(next.document?.version).toBe(1);
  });
});

describe("parseCachedScene", () => {
  // Snapshot shape: { appState, document, assets: Asset[], materials: Material[] } (maps as plain arrays of values).
  function snapshot(overrides: Record<string, unknown> = {}) {
    const state = loadedState(3);
    return { appState: state.appState, document: state.document, assets: [...state.assets.values()], materials: [...state.materials.values()], ...overrides };
  }

  // Red if the snapshot written by the cache cannot be read back.
  it("round-trips a valid snapshot (also through JSON)", () => {
    const raw = JSON.parse(JSON.stringify(snapshot()));
    const parsed = parseCachedScene(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.appState).toEqual(loadedState(3).appState);
    expect(parsed!.document).toEqual(loadedState(3).document);
    expect(parsed!.assets).toBeInstanceOf(Map);
    expect(parsed!.materials).toBeInstanceOf(Map);
    expect([...parsed!.assets.keys()].sort()).toEqual(SEED_ASSETS.map((asset) => asset.id).sort());
    expect(parsed!.assets.get("asset_sofa")).toMatchObject({ id: "asset_sofa", name: SOFA_ASSET.name });
    expect(parsed!.materials.get("mat_oak_floorboards")?.fallbackColor).toBe(OAK_FLOOR.fallbackColor);
  });

  // Red if a snapshot without a loaded document (document null) is discarded.
  it("accepts a snapshot whose document is null", () => {
    expect(parseCachedScene(snapshot({ document: null }))?.document).toBeNull();
  });

  // Red if garbage is turned into scene data.
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "scene"],
    ["a number", 42],
    ["an array", []],
    ["an empty object", {}],
  ])("returns null for %s", (_name, raw) => {
    expect(parseCachedScene(raw)).toBeNull();
  });

  // Red if partial snapshots are accepted.
  it.each(["appState", "assets", "materials"])("returns null when %s is missing", (key) => {
    const raw: Record<string, unknown> = snapshot();
    delete raw[key];
    expect(parseCachedScene(raw)).toBeNull();
  });

  // Red if content is not validated with the core schemas.
  it("returns null for an invalid document", () => {
    const state = loadedState(3);
    const apartment = structuredClone(state.document!.apartment);
    apartment.meta.ceilingHeight = 99;
    expect(parseCachedScene(snapshot({ document: { ...state.document, apartment } }))).toBeNull();
  });

  it("returns null for an invalid asset", () => {
    const broken = { ...SOFA_ASSET, id: "not-an-asset-id" } as Asset;
    expect(parseCachedScene(snapshot({ assets: [broken] }))).toBeNull();
  });

  it("returns null for an invalid material", () => {
    expect(parseCachedScene(snapshot({ materials: [{ ...OAK_FLOOR, fallbackColor: "red" }] }))).toBeNull();
  });

  it("returns null for an invalid app state", () => {
    expect(parseCachedScene(snapshot({ appState: { ...loadedState().appState, mode: "nonsense" } }))).toBeNull();
  });
});
