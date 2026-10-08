import {
  appStateSchema,
  assetSchema,
  documentContentSchema,
  materialSchema,
  safeParseWithIssues,
  type AppState,
  type Asset,
  type Document,
  type Material,
  type Result,
  type ValidationIssue,
} from "@app/core";

/** A raw database row as delivered by PostgREST or Realtime (snake_case columns). */
export type DbRow = Record<string, unknown>;

/** The active planner document: core's content plus the sync fields of the row. */
export type PlannerDocument = Document & { version: number; updatedAt: string };

/** An asset with the row version used for change detection. */
export type VersionedAsset = Asset & { version: number };

/** Thrown when a row's content fails core's validation; carries the row id and core's issues. */
export class RowValidationError extends Error {
  readonly rowId: string;
  readonly issues: ValidationIssue[];

  constructor(rowId: string, issues: ValidationIssue[]) {
    super(`Row "${rowId}" failed validation: ${issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ")}`);
    this.name = "RowValidationError";
    this.rowId = rowId;
    this.issues = issues;
  }
}

function unwrap<T>(rowId: string, result: Result<T>): T {
  if (!result.ok) throw new RowValidationError(rowId, result.issues);
  return result.value;
}

const isSoftDeleted = (row: DbRow): boolean => row.deleted_at !== null && row.deleted_at !== undefined;

/** Maps a `documents` row; returns null for soft-deleted rows, throws RowValidationError for invalid content. */
export function documentFromRow(row: DbRow): PlannerDocument | null {
  if (isSoftDeleted(row)) return null;
  const id = row.id as string;
  const content = unwrap(
    id,
    safeParseWithIssues(documentContentSchema, { name: row.name, apartment: row.apartment, items: row.items, lighting: row.lighting }),
  );
  return {
    ...content,
    id,
    source: row.source as Document["source"],
    version: row.version as number,
    updatedAt: row.updated_at as string,
  };
}

/** Maps an `assets` row to a core asset plus its version; null for soft-deleted rows. */
export function assetFromRow(row: DbRow): VersionedAsset | null {
  if (isSoftDeleted(row)) return null;
  const id = row.id as string;
  const asset = unwrap(
    id,
    safeParseWithIssues(assetSchema, {
      id,
      name: row.name,
      category: row.category,
      params: row.params,
      parts: row.parts,
      referenceImages: row.reference_images,
    }),
  );
  return { ...asset, version: row.version as number };
}

/** Maps a `materials` row to a core material; null for soft-deleted rows. */
export function materialFromRow(row: DbRow): Material | null {
  if (isSoftDeleted(row)) return null;
  const id = row.id as string;
  return unwrap(
    id,
    safeParseWithIssues(materialSchema, {
      id,
      name: row.name,
      source: row.source,
      sourceId: row.source_id,
      license: row.license,
      sourceUrl: row.source_url,
      maps: row.maps,
      importStatus: row.import_status,
      tileSize: row.tile_size,
      tint: row.tint,
      roughnessFactor: row.roughness_factor,
      metalnessFactor: row.metalness_factor,
      fallbackColor: row.fallback_color,
    }),
  );
}

/** Maps the `app_state` row to core's AppState. */
export function appStateFromRow(row: DbRow): AppState {
  return unwrap(
    String(row.id),
    safeParseWithIssues(appStateSchema, {
      mode: row.mode,
      activeDocumentId: row.active_document_id,
      activeAssetId: row.active_asset_id,
      editorView: row.editor_view,
      renderMode: row.render_mode,
      photoResolution: row.photo_resolution,
      camera: row.camera,
      focusId: row.focus_id,
      selection: row.selection,
      workshopCamera: row.workshop_camera,
      workshopLight: row.workshop_light,
      measurementOverlay: row.measurement_overlay,
      aiBusyUntil: row.ai_busy_until,
    }),
  );
}
