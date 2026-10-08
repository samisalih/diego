import type { Asset, Material } from "@app/core";
import { SEED_ASSETS, SEED_DOCUMENT, SEED_MATERIALS } from "../../../../packages/core/src/seed/index.ts";

// Row builders mirror supabase/migrations/20261008120000_tables.sql (snake_case columns).

export const UPDATED_AT = "2026-10-08T10:00:00+00:00";

export function documentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SEED_DOCUMENT.id,
    name: SEED_DOCUMENT.name,
    source: SEED_DOCUMENT.source,
    apartment: structuredClone(SEED_DOCUMENT.apartment),
    items: structuredClone(SEED_DOCUMENT.items),
    lighting: structuredClone(SEED_DOCUMENT.lighting),
    thumbnail_path: null,
    thumbnail_rendered_at: null,
    version: 1,
    deleted_at: null,
    created_at: UPDATED_AT,
    updated_at: UPDATED_AT,
    ...overrides,
  };
}

export function assetRow(asset: Asset, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: asset.id,
    name: asset.name,
    category: asset.category,
    params: structuredClone(asset.params),
    parts: structuredClone(asset.parts),
    reference_images: structuredClone(asset.referenceImages),
    thumbnail_path: null,
    content_hash: "0000000000000000",
    version: 1,
    trash_dependents: null,
    deleted_at: null,
    created_at: UPDATED_AT,
    updated_at: UPDATED_AT,
    ...overrides,
  };
}

export function materialRow(material: Material, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: material.id,
    name: material.name,
    source: material.source,
    source_id: material.sourceId ?? null,
    license: material.license,
    source_url: material.sourceUrl ?? null,
    maps: structuredClone(material.maps),
    import_status: material.importStatus,
    tile_size: material.tileSize,
    tint: material.tint ?? null,
    roughness_factor: material.roughnessFactor,
    metalness_factor: material.metalnessFactor ?? null,
    fallback_color: material.fallbackColor,
    thumbnail_path: null,
    content_hash: "0000000000000000",
    trash_dependents: null,
    deleted_at: null,
    created_at: UPDATED_AT,
    updated_at: UPDATED_AT,
    ...overrides,
  };
}

export function appStateRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    mode: "editor",
    active_document_id: SEED_DOCUMENT.id,
    active_asset_id: null,
    editor_view: "dollhouse",
    render_mode: "work",
    photo_resolution: { width: 1920, height: 1080 },
    camera: null,
    focus_id: null,
    selection: [],
    workshop_camera: "perspective",
    workshop_light: "studio",
    measurement_overlay: [],
    ai_busy_until: null,
    updated_at: UPDATED_AT,
    ...overrides,
  };
}

export const SOFA_ASSET: Asset = SEED_ASSETS.find((asset) => asset.id === "asset_sofa")!;
export const OAK_FLOOR: Material = SEED_MATERIALS.find((material) => material.id === "mat_oak_floorboards")!;
