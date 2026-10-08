import { SEED_DOCUMENT, SEED_MATERIALS } from "../../../packages/core/src/seed/index.ts";
import { describe, expect, it } from "vitest";
import { appStateFromRow, assetFromRow, documentFromRow, materialFromRow, RowValidationError } from "../src/data/mappers.ts";
import { appStateRow, assetRow, documentRow, materialRow, OAK_FLOOR, SOFA_ASSET, UPDATED_AT } from "./helpers/rows.ts";

describe("data/mappers", () => {
  describe("documentFromRow", () => {
    // Red if a column is not mapped to its camelCase field or extra columns leak through.
    it("maps a document row to exactly the planner document shape", () => {
      const document = documentFromRow(documentRow({ version: 7 }));
      expect(document).toEqual({
        id: SEED_DOCUMENT.id,
        name: SEED_DOCUMENT.name,
        source: SEED_DOCUMENT.source,
        apartment: SEED_DOCUMENT.apartment,
        items: SEED_DOCUMENT.items,
        lighting: SEED_DOCUMENT.lighting,
        version: 7,
        updatedAt: UPDATED_AT,
      });
      expect(Object.keys(document!).sort()).toEqual(["apartment", "id", "items", "lighting", "name", "source", "updatedAt", "version"]);
    });

    // Red if the content is passed through unvalidated.
    it("throws a RowValidationError carrying the row id and core's issues for invalid content", () => {
      const apartment = structuredClone(SEED_DOCUMENT.apartment);
      apartment.meta.ceilingHeight = 99;
      let caught: unknown;
      try {
        documentFromRow(documentRow({ apartment }));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(RowValidationError);
      const error = caught as RowValidationError;
      expect(error.rowId).toBe(SEED_DOCUMENT.id);
      expect(error.issues.length).toBeGreaterThan(0);
      expect(error.issues.some((issue) => issue.field.includes("ceilingHeight"))).toBe(true);
      expect(error.issues[0]).toEqual(expect.objectContaining({ field: expect.any(String), allowed: expect.any(String), message: expect.any(String) }));
    });

    // Red if duplicate item ids (a cross-field rule of the content schema) slip through.
    it("rejects content that violates cross-field rules", () => {
      const items = [SEED_DOCUMENT.items[0], SEED_DOCUMENT.items[0]];
      expect(() => documentFromRow(documentRow({ items }))).toThrow(RowValidationError);
    });

    // Red if a soft-deleted row is still turned into a document.
    it("treats a soft-deleted row as absent", () => {
      expect(documentFromRow(documentRow({ deleted_at: "2026-10-08T11:00:00+00:00" }))).toBeNull();
    });

    // Red if the mapper mutates its input.
    it("does not mutate the row", () => {
      const row = documentRow();
      const copy = structuredClone(row);
      documentFromRow(row);
      expect(row).toEqual(copy);
    });
  });

  describe("assetFromRow", () => {
    // Red if reference_images is not mapped to referenceImages or the version is dropped.
    it("maps an asset row to a core asset plus its version", () => {
      const asset = assetFromRow(assetRow(SOFA_ASSET, { version: 4 }));
      expect(asset).toEqual({ ...SOFA_ASSET, version: 4 });
    });

    // Red if soft-deleted rows are kept.
    it("treats a soft-deleted row as absent", () => {
      expect(assetFromRow(assetRow(SOFA_ASSET, { deleted_at: UPDATED_AT }))).toBeNull();
    });
  });

  describe("materialFromRow", () => {
    // Red if any snake_case column (tile_size, fallback_color, ...) is not mapped.
    it("maps every seed material row back to the seed material", () => {
      for (const material of SEED_MATERIALS) {
        expect(materialFromRow(materialRow(material))).toEqual(material);
      }
    });

    // Red if null columns are mapped to something else than null/absent.
    it("keeps tint and metalness factor optional", () => {
      const material = materialFromRow(materialRow(OAK_FLOOR, { tint: "#ff8800", metalness_factor: 0.4 }));
      expect(material).toMatchObject({ tint: "#ff8800", metalnessFactor: 0.4, fallbackColor: OAK_FLOOR.fallbackColor, tileSize: OAK_FLOOR.tileSize });
    });

    // Red if soft-deleted rows are kept.
    it("treats a soft-deleted row as absent", () => {
      expect(materialFromRow(materialRow(OAK_FLOOR, { deleted_at: UPDATED_AT }))).toBeNull();
    });
  });

  describe("appStateFromRow", () => {
    // Red if any column of app_state is not mapped.
    it("maps the app_state row to core's AppState", () => {
      const camera = { position: [1, 2, 3], target: [0, 0, 0], focalLength: 35 };
      const state = appStateFromRow(appStateRow({
        camera,
        selection: ["item_sofa"],
        focus_id: "item_sofa",
        active_asset_id: "asset_sofa",
        ai_busy_until: "2026-10-08T12:00:00+00:00",
        measurement_overlay: [{ from: [0, 0, 0], to: [1, 0, 0] }],
      }));
      expect(state).toEqual({
        mode: "editor",
        activeDocumentId: SEED_DOCUMENT.id,
        activeAssetId: "asset_sofa",
        editorView: "dollhouse",
        renderMode: "work",
        photoResolution: { width: 1920, height: 1080 },
        camera,
        focusId: "item_sofa",
        selection: ["item_sofa"],
        workshopCamera: "perspective",
        workshopLight: "studio",
        measurementOverlay: [{ from: [0, 0, 0], to: [1, 0, 0] }],
        aiBusyUntil: "2026-10-08T12:00:00+00:00",
      });
    });

    // Red if nullable columns turn into undefined.
    it("keeps null columns null", () => {
      const state = appStateFromRow(appStateRow({ active_document_id: null }));
      expect(state.activeDocumentId).toBeNull();
      expect(state.camera).toBeNull();
      expect(state.aiBusyUntil).toBeNull();
    });
  });
});
