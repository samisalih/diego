import { describe, expect, it } from "vitest";
import { decodeToon, detectFormat } from "../src/toon.ts";
import { buildExportBundle, serializeBundle } from "../src/export/bundle.ts";
import { parseImport, planImport } from "../src/export/import.ts";
import {
  buildValidAsset,
  buildValidDocument,
  buildValidMaterial,
  buildValidModel,
} from "./fixtures.ts";

// ---------- scenario builders (plain literals, schema-independent) ----------

function buildContent() {
  const { id: _id, source: _source, ...content } = buildValidDocument();
  return content;
}

function buildMaterialNamed(id: string, overrides: Record<string, unknown> = {}) {
  return { ...buildValidMaterial(), id, name: `Material ${id}`, ...overrides };
}

function buildModelNamed(id: string, overrides: Record<string, unknown> = {}) {
  return { ...buildValidModel(), id, name: `Model ${id}`, storagePath: `${id}/file.glb`, ...overrides };
}

// The sofa asset (parts: seat with mat_oak, legs without material) plus a leg material and a model part.
function buildSofaWithModelAndLegMaterial() {
  const asset = buildValidAsset();
  asset.parts[1] = { ...asset.parts[1], materialId: "mat_leg" } as never;
  asset.parts.push({
    id: "part_vase",
    name: "Vase",
    shape: "model",
    x: 0,
    y: 0.6,
    z: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    w: 0.2,
    h: 0.3,
    d: 0.2,
    bevel: 0,
    modelId: "model_vase",
    scaleMode: "fit",
  } as never);
  return asset;
}

// Pool with used and unused entities. Used: asset_sofa, mat_oak (room floor + seat), mat_wall (room wall),
// mat_frame (opening), mat_leg (asset part), model_vase (asset part).
function buildPool() {
  const content = buildContent();
  content.apartment.rooms[1] = { ...content.apartment.rooms[1], wallMaterialId: "mat_wall" } as never;
  content.apartment.openings[0] = { ...content.apartment.openings[0], frameMaterialId: "mat_frame" } as never;
  const unusedAsset = { ...buildValidAsset(), id: "asset_unused", name: "Unused" };
  unusedAsset.parts[0] = { ...unusedAsset.parts[0], materialId: "mat_unused_asset" } as never;
  return {
    content,
    pool: {
      assets: [buildSofaWithModelAndLegMaterial(), unusedAsset],
      materials: [
        buildMaterialNamed("mat_oak"),
        buildMaterialNamed("mat_wall"),
        buildMaterialNamed("mat_frame"),
        buildMaterialNamed("mat_leg"),
        buildMaterialNamed("mat_unused"),
        buildMaterialNamed("mat_unused_asset"),
      ],
      models: [buildModelNamed("model_vase"), buildModelNamed("model_unused")],
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function idsOf(list: { id: string }[]) {
  return list.map((entry) => entry.id).sort();
}

function buildBundleFromPool() {
  const { content, pool } = buildPool();
  return buildExportBundle(content as never, pool as never);
}

// ---------- buildExportBundle ----------

describe("buildExportBundle", () => {
  // Red when the bundle header or the document is not carried over as-is.
  it("sets the format header and keeps the document content", () => {
    const { content, pool } = buildPool();
    const bundle = buildExportBundle(content as never, pool as never);
    expect(bundle.format).toBe("apartment-planner");
    expect(bundle.version).toBe(1);
    expect(bundle.document).toEqual(content);
  });

  // Red when all assets of the pool are exported instead of those placed as items.
  it("includes only assets used by items", () => {
    expect(idsOf(buildBundleFromPool().assets)).toEqual(["asset_sofa"]);
  });

  // Red when any of the four material sources (room, opening, part, asset-of-item) is skipped,
  // or when materials of unused assets / the whole pool leak in.
  it("includes materials referenced by rooms, openings and parts of used assets only", () => {
    expect(idsOf(buildBundleFromPool().materials)).toEqual(["mat_frame", "mat_leg", "mat_oak", "mat_wall"]);
  });

  // Red when models are exported unconditionally or model parts are ignored.
  it("includes only models referenced by parts of used assets", () => {
    expect(idsOf(buildBundleFromPool().models)).toEqual(["model_vase"]);
  });

  // Red when entities are mutated or replaced by lossy copies.
  it("exports the entities unchanged", () => {
    const { content, pool } = buildPool();
    const bundle = buildExportBundle(content as never, pool as never);
    expect(bundle.assets[0]).toEqual(pool.assets[0]);
    expect(bundle.models[0]).toEqual(pool.models[0]);
    expect(bundle.materials.find((m) => m.id === "mat_oak")).toEqual(pool.materials[0]);
  });

  // Red when the same asset/material is listed once per reference.
  it("lists each entity once even when referenced several times", () => {
    const { content, pool } = buildPool();
    content.items.push({ ...content.items[0], id: "item_sofa_2" } as never);
    const bundle = buildExportBundle(content as never, pool as never);
    expect(bundle.assets).toHaveLength(1);
    expect(bundle.materials.filter((m) => m.id === "mat_oak")).toHaveLength(1);
  });

  // Red when an empty document yields non-empty entity lists.
  it("exports empty lists for a document without items and materials", () => {
    const { content, pool } = buildPool();
    content.items = [];
    content.apartment.rooms = content.apartment.rooms.map((room) => ({
      ...room,
      floorMaterialId: null,
      wallMaterialId: null,
    })) as never;
    content.apartment.openings = content.apartment.openings.map((o) => ({ ...o, frameMaterialId: null })) as never;
    const bundle = buildExportBundle(content as never, pool as never);
    expect(bundle.assets).toEqual([]);
    expect(bundle.materials).toEqual([]);
    expect(bundle.models).toEqual([]);
  });
});

// ---------- serializeBundle ----------

describe("serializeBundle", () => {
  // Red when the json output is not parseable JSON of the bundle.
  it("serialises to JSON that parses back to the bundle", () => {
    const bundle = buildBundleFromPool();
    const text = serializeBundle(bundle, "json");
    expect(detectFormat(text)).toBe("json");
    expect(JSON.parse(text)).toEqual(bundle);
  });

  // Red when the toon output is not TOON or does not decode to the bundle.
  it("serialises to TOON that decodes back to the bundle", () => {
    const bundle = buildBundleFromPool();
    const text = serializeBundle(bundle, "toon");
    expect(detectFormat(text)).toBe("toon");
    expect(decodeToon(text)).toEqual(JSON.parse(JSON.stringify(bundle)));
  });

  // Red when the toon format falls back to JSON text.
  it("produces different text for the two formats", () => {
    const bundle = buildBundleFromPool();
    expect(serializeBundle(bundle, "toon")).not.toBe(serializeBundle(bundle, "json"));
  });
});

// ---------- parseImport ----------

function failedIssues(result: ReturnType<typeof parseImport>) {
  if (result.ok) throw new Error("expected parseImport to fail");
  return result.issues as (typeof result.issues[number] & { line?: number })[];
}

describe("parseImport", () => {
  // Red when valid TOON is rejected or the value is altered on parse.
  it("parses a valid TOON bundle", () => {
    const bundle = buildBundleFromPool();
    const result = parseImport(serializeBundle(bundle, "toon"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(bundle);
  });

  // Red when valid JSON is rejected or the value is altered on parse.
  it("parses a valid JSON bundle", () => {
    const bundle = buildBundleFromPool();
    const result = parseImport(serializeBundle(bundle, "json"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(bundle);
  });

  // Red when the explicit format argument is ignored in favour of detection or breaks parsing.
  it("accepts an explicit format argument", () => {
    const bundle = buildBundleFromPool();
    const result = parseImport(serializeBundle(bundle, "toon"), "toon");
    expect(result.ok).toBe(true);
  });

  // Red when strict JSON.parse is used (trailing commas are common in AI output).
  it("tolerates trailing commas in JSON objects and arrays", () => {
    const bundle = buildBundleFromPool();
    const pretty = JSON.stringify(bundle, null, 2);
    const withCommas = pretty.replace(/([^\s{[,])(\s*\n\s*[}\]])/g, "$1,$2");
    expect(withCommas).not.toBe(pretty);
    expect(() => JSON.parse(withCommas)).toThrow();
    const result = parseImport(withCommas);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(bundle);
  });

  // Red when a Markdown fence around the payload is not stripped.
  it("strips a ```json code fence", () => {
    const bundle = buildBundleFromPool();
    const result = parseImport("```json\n" + serializeBundle(bundle, "json") + "\n```");
    expect(result.ok).toBe(true);
  });

  // Red when a Markdown fence around TOON is not stripped.
  it("strips a ```toon code fence", () => {
    const bundle = buildBundleFromPool();
    const result = parseImport("Here you go:\n\n```toon\n" + serializeBundle(bundle, "toon") + "\n```\n");
    expect(result.ok).toBe(true);
  });

  // Red when the BOM is not stripped.
  it("strips a byte order mark", () => {
    const bundle = buildBundleFromPool();
    expect(parseImport("﻿" + serializeBundle(bundle, "json")).ok).toBe(true);
    expect(parseImport("﻿" + serializeBundle(bundle, "toon")).ok).toBe(true);
  });

  // Red when a JSON syntax error is reported without a line, or with a wrong one.
  it("reports the line of a JSON syntax error", () => {
    const text = '{\n  "format": "apartment-planner",\n  oops\n}';
    const issues = failedIssues(parseImport(text));
    expect(issues.length).toBeGreaterThan(0);
    expect(typeof issues[0].field).toBe("string");
    expect(issues[0].line).toBe(3);
    expect(issues[0].message.length).toBeGreaterThan(0);
  });

  // Red when TOON syntax errors lose the decoder's line information.
  it("reports the line of a TOON syntax error", () => {
    const text = "format: apartment-planner\nversion: 1\nx:\n    y: 1\n  z: 2";
    const issues = failedIssues(parseImport(text));
    expect(issues.length).toBeGreaterThan(0);
    expect(typeof issues[0].field).toBe("string");
    expect(issues[0].line).toBe(4);
  });

  // Red when garbage input throws instead of returning issues.
  it("returns issues instead of throwing for empty or non-object input", () => {
    for (const text of ["", "   ", "[1,2,3]", '"just a string"']) {
      expect(failedIssues(parseImport(text)).length).toBeGreaterThan(0);
    }
  });

  // Red when a wrong format marker is accepted or reported on another field.
  it("rejects a wrong format marker with field 'format'", () => {
    const bundle = { ...buildBundleFromPool(), format: "something-else" };
    const issues = failedIssues(parseImport(JSON.stringify(bundle)));
    expect(issues.map((i) => i.field)).toContain("format");
  });

  // Red when an unsupported version is accepted.
  it("rejects an unsupported version with field 'version'", () => {
    const bundle = { ...buildBundleFromPool(), version: 2 };
    const issues = failedIssues(parseImport(JSON.stringify(bundle)));
    expect(issues.map((i) => i.field)).toContain("version");
  });

  // Red when the schema is not applied to nested values, or field / allowed are missing.
  it("reports schema violations with field and allowed", () => {
    const bundle = buildBundleFromPool();
    bundle.document.apartment.meta.ceilingHeight = 9;
    const issues = failedIssues(parseImport(JSON.stringify(bundle)));
    const issue = issues.find((i) => i.field === "document.apartment.meta.ceilingHeight");
    expect(issue).toBeDefined();
    expect(issue?.value).toBe(9);
    expect(issue?.allowed).toContain("2");
    expect(issue?.allowed).toContain("5");
  });

  // Red when array entries with an id are addressed by index instead of id.
  it("addresses array entries by id in issue fields", () => {
    const bundle = buildBundleFromPool() as unknown as { document: { items: Record<string, unknown>[] } };
    bundle.document.items[0]!.x = "abc";
    const issues = failedIssues(parseImport(JSON.stringify(bundle)));
    expect(issues.map((i) => i.field)).toContain("document.items.item_sofa_1.x");
  });

  // Red when cross-field rules (opening must reference an existing wall) are skipped on import.
  it("applies the apartment cross-field rules", () => {
    const bundle = buildBundleFromPool();
    bundle.document.apartment.openings[0].wallId = "wall_missing";
    const issues = failedIssues(parseImport(JSON.stringify(bundle)));
    expect(issues.map((i) => i.field)).toContain("document.apartment.openings.opening_window.wallId");
  });

  // Red when only the first violation is reported.
  it("reports all violations, not only the first", () => {
    const bundle = buildBundleFromPool();
    bundle.document.apartment.meta.ceilingHeight = 9;
    bundle.materials[0].tileSize = -1;
    const issues = failedIssues(parseImport(JSON.stringify(bundle)));
    expect(issues.length).toBeGreaterThanOrEqual(2);
    for (const issue of issues) {
      expect(issue.field.length).toBeGreaterThan(0);
      expect(issue.allowed.length).toBeGreaterThan(0);
    }
  });
});

// ---------- planImport ----------

const FRESH_ID = (prefix: string) => new RegExp(`^${prefix}_[a-z0-9]{10}$`);

function emptyExisting() {
  return { assets: [] as never[], materials: [] as never[], models: [] as never[] };
}

// Bundle without assets: a document whose rooms reference mat_oak only.
function buildMaterialOnlyBundle(material = buildValidMaterial()) {
  const content = buildContent();
  content.items = [];
  return buildExportBundle(content as never, {
    assets: [],
    materials: [material, buildMaterialNamed("mat_wall"), buildMaterialNamed("mat_frame"), buildMaterialNamed("mat_leg")],
    models: [],
  } as never);
}

describe("planImport", () => {
  // Red when an identical entity is created again instead of reused (duplicates in the library).
  it("reuses identical entities and creates nothing", () => {
    const bundle = buildBundleFromPool();
    const plan = planImport(bundle, {
      assets: clone(bundle.assets),
      materials: clone(bundle.materials),
      models: clone(bundle.models),
    } as never);
    expect(plan.assets.create).toEqual([]);
    expect(plan.materials.create).toEqual([]);
    expect(plan.models.create).toEqual([]);
    expect(plan.assets.reuse).toEqual({ asset_sofa: "asset_sofa" });
    expect(plan.models.reuse).toEqual({ model_vase: "model_vase" });
    expect(Object.keys(plan.materials.reuse).sort()).toEqual(["mat_frame", "mat_leg", "mat_oak", "mat_wall"]);
    expect(plan.content).toEqual(bundle.document);
  });

  // Red when matching uses the id instead of the content hash, or the document keeps the old id.
  it("reuses an identical material stored under another id and rewrites the document", () => {
    const bundle = buildMaterialOnlyBundle();
    const existingOak = { ...buildValidMaterial(), id: "mat_existing_oak" };
    const plan = planImport(bundle, { ...emptyExisting(), materials: [existingOak] } as never);
    expect(plan.materials.reuse).toEqual({ mat_oak: "mat_existing_oak" });
    expect(plan.materials.create.map((m) => m.id)).not.toContain("mat_oak");
    expect(plan.content.apartment.rooms[0].floorMaterialId).toBe("mat_existing_oak");
  });

  // Red when the hash depends on key order.
  it("matches by content regardless of key order", () => {
    const bundle = buildMaterialOnlyBundle();
    const reversed = Object.fromEntries(Object.entries({ ...buildValidMaterial(), id: "mat_existing_oak" }).reverse());
    const plan = planImport(bundle, { ...emptyExisting(), materials: [reversed] } as never);
    expect(plan.materials.reuse.mat_oak).toBe("mat_existing_oak");
  });

  // Red when a changed entity with the same id is reused (silent data loss) or overwrites the existing one.
  it("creates a changed material with a fresh id and never reuses the same-id existing one", () => {
    const bundle = buildMaterialOnlyBundle();
    const existing = { ...buildValidMaterial(), fallbackColor: "#000000" };
    const existingSnapshot = clone(existing);
    const plan = planImport(bundle, { ...emptyExisting(), materials: [existing] } as never);
    const created = plan.materials.create.find((m) => m.name === buildValidMaterial().name);
    expect(created).toBeDefined();
    expect(created?.id).toMatch(FRESH_ID("mat"));
    expect(created?.fallbackColor).toBe("#a0784c");
    expect(plan.materials.reuse).not.toHaveProperty("mat_oak");
    expect(plan.content.apartment.rooms[0].floorMaterialId).toBe(created?.id);
    expect(existing).toEqual(existingSnapshot);
  });

  // Red when a created entity keeps anything but the id changed (content must equal the bundle's).
  it("keeps all content of a created material except the id", () => {
    const bundle = buildMaterialOnlyBundle();
    const existing = { ...buildValidMaterial(), fallbackColor: "#000000" };
    const plan = planImport(bundle, { ...emptyExisting(), materials: [existing] } as never);
    const created = plan.materials.create.find((m) => m.name === buildValidMaterial().name);
    expect({ ...created, id: "x" }).toEqual({ ...buildValidMaterial(), id: "x" });
  });

  // Red when entities without any existing counterpart are not created.
  it("creates entities that do not exist yet, with fresh unique ids", () => {
    const bundle = buildBundleFromPool();
    const plan = planImport(bundle, emptyExisting() as never);
    expect(plan.assets.create).toHaveLength(1);
    expect(plan.models.create).toHaveLength(1);
    expect(plan.materials.create).toHaveLength(4);
    const newIds = [
      ...plan.assets.create.map((a) => a.id),
      ...plan.models.create.map((m) => m.id),
      ...plan.materials.create.map((m) => m.id),
    ];
    expect(new Set(newIds).size).toBe(newIds.length);
    expect(plan.assets.create[0].id).toMatch(FRESH_ID("asset"));
    expect(plan.models.create[0].id).toMatch(FRESH_ID("model"));
    for (const material of plan.materials.create) expect(material.id).toMatch(FRESH_ID("mat"));
    // Fresh ids must not collide with the ids of the bundle.
    expect(newIds).not.toContain("asset_sofa");
    expect(newIds).not.toContain("mat_oak");
    expect(newIds).not.toContain("model_vase");
  });

  // Red when item.assetId is not rewritten after the asset got a fresh id.
  it("rewrites item asset references to the created asset id", () => {
    const bundle = buildBundleFromPool();
    const plan = planImport(bundle, emptyExisting() as never);
    expect(plan.content.items[0].assetId).toBe(plan.assets.create[0].id);
  });

  // Red when item asset references are rewritten for reused assets incorrectly (reuse under another id).
  it("rewrites item asset references to a reused asset's existing id", () => {
    const bundle = buildBundleFromPool();
    const existingAsset = { ...clone(bundle.assets[0]), id: "asset_existing_sofa" };
    const plan = planImport(bundle, {
      assets: [existingAsset],
      materials: clone(bundle.materials),
      models: clone(bundle.models),
    } as never);
    expect(plan.assets.reuse).toEqual({ asset_sofa: "asset_existing_sofa" });
    expect(plan.assets.create).toEqual([]);
    expect(plan.content.items[0].assetId).toBe("asset_existing_sofa");
  });

  // Red when chained references are not resolved: a new material used by a new asset must carry its
  // new id inside the asset, and every other reference site (room, opening, part, model part) is rewritten.
  it("rewrites references in the document and in created assets, including chains", () => {
    const bundle = buildBundleFromPool();
    const plan = planImport(bundle, emptyExisting() as never);

    const newMaterialIdFor = (name: string) => {
      const material = plan.materials.create.find((m) => m.name === name);
      expect(material).toBeDefined();
      return material?.id as string;
    };
    const oak = newMaterialIdFor("Material mat_oak");
    const wall = newMaterialIdFor("Material mat_wall");
    const frame = newMaterialIdFor("Material mat_frame");
    const leg = newMaterialIdFor("Material mat_leg");
    const vase = plan.models.create[0].id;

    const { rooms, openings } = plan.content.apartment;
    expect(rooms[0].floorMaterialId).toBe(oak);
    expect(rooms[0].wallMaterialId).toBeNull();
    expect(rooms[1].wallMaterialId).toBe(wall);
    expect(openings[0].frameMaterialId).toBe(frame);

    const asset = plan.assets.create[0];
    const parts = asset.parts as unknown as Record<string, unknown>[];
    expect(parts.find((p) => p.id === "part_seat")?.materialId).toBe(oak);
    expect(parts.find((p) => p.id === "part_leg")?.materialId).toBe(leg);
    expect(parts.find((p) => p.id === "part_vase")?.modelId).toBe(vase);
    // Nothing of the old ids is left anywhere in the plan's output.
    const serialized = JSON.stringify([plan.content, plan.assets.create]);
    for (const oldId of ["mat_oak", "mat_wall", "mat_frame", "mat_leg", "model_vase"]) {
      expect(serialized).not.toContain(`"${oldId}"`);
    }
  });

  // Red when a part without material gets one invented, or a null reference becomes a string.
  it("leaves absent and null references untouched", () => {
    const bundle = buildBundleFromPool();
    const plan = planImport(bundle, emptyExisting() as never);
    const parts = plan.assets.create[0].parts as unknown as Record<string, unknown>[];
    expect(parts.find((p) => p.id === "part_seat")?.modelId).toBeUndefined();
    expect(plan.content.apartment.rooms[1].floorMaterialId ?? null).toBeNull();
  });

  // Red when a changed asset is matched by id and reused, or when the existing asset is modified.
  it("creates a changed asset with a fresh id and leaves the existing one untouched", () => {
    const bundle = buildBundleFromPool();
    const existingAsset = { ...clone(bundle.assets[0]), name: "Old sofa" };
    const existing = {
      assets: [existingAsset],
      materials: clone(bundle.materials),
      models: clone(bundle.models),
    };
    const snapshot = clone(existing);
    const plan = planImport(bundle, existing as never);
    expect(plan.assets.create).toHaveLength(1);
    expect(plan.assets.create[0].id).toMatch(FRESH_ID("asset"));
    expect(plan.assets.create[0].name).toBe("Sofa");
    expect(plan.assets.reuse).toEqual({});
    expect(plan.content.items[0].assetId).toBe(plan.assets.create[0].id);
    expect(existing).toEqual(snapshot);
  });

  // Red when the input bundle is mutated while rewriting references.
  it("does not mutate the bundle", () => {
    const bundle = buildBundleFromPool();
    const snapshot = clone(bundle);
    planImport(bundle, emptyExisting() as never);
    expect(bundle).toEqual(snapshot);
  });

  // Red when two changed entities share one fresh id or the reuse map contains created entities.
  it("gives every created material its own id and keeps created ids out of reuse", () => {
    const bundle = buildBundleFromPool();
    const existing = {
      ...emptyExisting(),
      materials: bundle.materials.slice(0, 2).map((m) => ({ ...clone(m), tileSize: 99 })),
    };
    const plan = planImport(bundle, existing as never);
    const ids = plan.materials.create.map((m) => m.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(Object.keys(plan.materials.reuse)).toEqual([]);
  });

  // Red when a model matched by hash under another id is not reused, or the part keeps the old model id.
  it("reuses an identical model under another id and rewrites model parts of created assets", () => {
    const bundle = buildBundleFromPool();
    const existingModel = { ...clone(bundle.models[0]), id: "model_existing_vase" };
    const plan = planImport(bundle, { ...emptyExisting(), models: [existingModel] } as never);
    expect(plan.models.reuse).toEqual({ model_vase: "model_existing_vase" });
    expect(plan.models.create).toEqual([]);
    const parts = plan.assets.create[0].parts as unknown as Record<string, unknown>[];
    expect(parts.find((p) => p.id === "part_vase")?.modelId).toBe("model_existing_vase");
  });
});
