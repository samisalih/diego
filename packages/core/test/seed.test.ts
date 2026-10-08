// Seed data tests: the dummy apartment "Musterwohnung" that fills the app until real data exists.
// Seed data lives in src/seed/ as typed TS; buildSeedSql() turns it into supabase/seed.sql.
import { describe, expect, it } from "vitest";
import { resolveAsset } from "../src/asset/resolve.ts";
import { assetContentHash, materialContentHash } from "../src/hash.ts";
import { checkLayout } from "../src/layout-check.ts";
import { assetSchema } from "../src/schemas/asset.ts";
import { documentSchema } from "../src/schemas/document.ts";
import { materialSchema } from "../src/schemas/material.ts";
import { SEED_ASSETS, SEED_DOCUMENT, SEED_MATERIALS } from "../src/seed/index.ts";
import { buildSeedSql } from "../src/seed/sql.ts";

// Local shoelace helper, independent of the production geometry module.
function shoelaceArea(polygon: [number, number][]): number {
  let sum = 0;
  polygon.forEach(([x1, z1], index) => {
    const [x2, z2] = polygon[(index + 1) % polygon.length]!;
    sum += x1 * z2 - x2 * z1;
  });
  return Math.abs(sum) / 2;
}

const materialIds = new Set(SEED_MATERIALS.map((material) => material.id));
const assetsById = new Map(SEED_ASSETS.map((asset) => [asset.id, asset]));
const getAsset = (id: string) => {
  const asset = assetsById.get(id);
  if (!asset) throw new Error(`Seed asset ${id} is missing`);
  return asset;
};
const defaultParams = (asset: { params: { key: string; default: number }[] }) =>
  Object.fromEntries(asset.params.map((param) => [param.key, param.default]));

describe("SEED_DOCUMENT", () => {
  // Red if the document violates the schema (bad ids, openings beyond walls, ...).
  it("validates with documentSchema", () => {
    expect(documentSchema.safeParse(SEED_DOCUMENT).success).toBe(true);
  });

  // Red if source or name change.
  it("is a user document named Musterwohnung", () => {
    expect(SEED_DOCUMENT.source).toBe("user");
    expect(SEED_DOCUMENT.name).toBe("Musterwohnung");
  });

  // Red if a room is renamed, added or dropped.
  it("has exactly the rooms Wohnzimmer, Schlafzimmer, Küche, Bad, Flur", () => {
    const names = SEED_DOCUMENT.apartment.rooms.map((room) => room.name).sort();
    expect(names).toEqual(["Bad", "Flur", "Küche", "Schlafzimmer", "Wohnzimmer"].sort());
  });

  // Red if the apartment is scaled out of the 50-60 m2 range.
  it("has a total room area between 50 and 60 m2", () => {
    const total = SEED_DOCUMENT.apartment.rooms.reduce((sum, room) => sum + shoelaceArea(room.polygon as [number, number][]), 0);
    expect(total).toBeGreaterThanOrEqual(50);
    expect(total).toBeLessThanOrEqual(60);
  });

  // Red if the ceiling height leaves the plausible range.
  it("has a ceiling height between 2.5 and 2.8 m", () => {
    const { ceilingHeight } = SEED_DOCUMENT.apartment.meta;
    expect(ceilingHeight).toBeGreaterThanOrEqual(2.5);
    expect(ceilingHeight).toBeLessThanOrEqual(2.8);
  });

  // Red if the location is not in Germany (sun position would be off).
  it("is located in Germany by latitude", () => {
    const { latitude } = SEED_DOCUMENT.apartment.meta;
    expect(latitude).toBeGreaterThanOrEqual(47);
    expect(latitude).toBeLessThanOrEqual(55);
  });

  // Red if openings are removed or the balcony door count changes.
  it("has at least 3 windows, exactly 1 balcony door and at least 4 doors", () => {
    const count = (type: string) => SEED_DOCUMENT.apartment.openings.filter((opening) => opening.type === type).length;
    expect(count("window")).toBeGreaterThanOrEqual(3);
    expect(count("balconyDoor")).toBe(1);
    expect(count("door")).toBeGreaterThanOrEqual(4);
  });

  // Red if a room lacks a material or references one that is not seeded.
  it("gives every room floor, wall and ceiling materials that exist in SEED_MATERIALS", () => {
    for (const room of SEED_DOCUMENT.apartment.rooms) {
      for (const materialId of [room.floorMaterialId, room.wallMaterialId, room.ceilingMaterialId]) {
        expect(materialId, `room ${room.name}`).toBeTruthy();
        expect(materialIds.has(materialId as string), `room ${room.name}: ${materialId}`).toBe(true);
      }
    }
  });

  // Red if an asset is not placed, or fewer than 2 chairs are placed.
  it("places each of the six assets at least once, chairs at least twice", () => {
    const countOf = (assetId: string) => SEED_DOCUMENT.items.filter((item) => item.assetId === assetId).length;
    for (const asset of SEED_ASSETS) expect(countOf(asset.id), asset.id).toBeGreaterThanOrEqual(1);
    expect(countOf("asset_chair")).toBeGreaterThanOrEqual(2);
  });

  // Red if furniture overlaps, blocks doors/windows, sits outside rooms or references unknown assets.
  it("has a layout without collision, blockedOpening, outsideRoom or unknownAsset issues", () => {
    const issues = checkLayout(SEED_DOCUMENT, assetsById);
    const blocking = issues.filter((issue) =>
      ["collision", "blockedOpening", "outsideRoom", "unknownAsset"].includes(issue.kind));
    expect(blocking).toEqual([]);
  });
});

describe("SEED_MATERIALS", () => {
  // Red if a material is added, dropped or re-id'd.
  it("contains exactly the six materials", () => {
    expect(SEED_MATERIALS.map((material) => material.id).sort()).toEqual(
      ["mat_oak_floorboards", "mat_tiles", "mat_wall_paint", "mat_linen", "mat_oak", "mat_brass"].sort(),
    );
  });

  // Red if ids collide.
  it("has unique ids", () => {
    expect(materialIds.size).toBe(SEED_MATERIALS.length);
  });

  // Red if any material loses its source, license, pending status, fallback color or plausible tile size.
  it.each(SEED_MATERIALS.map((material) => [material.id, material] as const))("%s is a valid pending CC0 material", (_id, material) => {
    expect(materialSchema.safeParse(material).success).toBe(true);
    expect(["polyhaven", "ambientcg"]).toContain(material.source);
    expect(material.sourceId).toBeTruthy();
    expect(material.license).toBe("CC0");
    expect(material.importStatus).toBe("pending");
    expect(material.fallbackColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(material.tileSize).toBeGreaterThanOrEqual(0.1);
    expect(material.tileSize).toBeLessThanOrEqual(5);
  });
});

describe("SEED_ASSETS", () => {
  // Red if an asset is added, dropped or re-id'd.
  it("contains exactly the six assets", () => {
    expect(SEED_ASSETS.map((asset) => asset.id).sort()).toEqual(
      ["asset_sofa", "asset_bed_160", "asset_shelf", "asset_dining_table", "asset_chair", "asset_floor_lamp"].sort(),
    );
  });

  describe.each(SEED_ASSETS.map((asset) => [asset.id, asset] as const))("%s", (assetId, asset) => {
    // Red if the asset breaks the schema.
    it("validates with assetSchema", () => {
      expect(assetSchema.safeParse(asset).success).toBe(true);
    });

    // Red if the asset is not parametric.
    it("has at least 2 params", () => {
      expect(asset.params.length).toBeGreaterThanOrEqual(2);
    });

    // Red if a part references a material that is not seeded.
    it("only uses seeded materials", () => {
      for (const part of asset.parts) {
        expect(part.materialId, `part ${part.id}`).toBeTruthy();
        expect(materialIds.has(part.materialId as string), `part ${part.id}: ${part.materialId}`).toBe(true);
      }
    });

    // Red if a formula is broken at default, min or max params.
    it("resolves without issues at default, min and max params", () => {
      const at = (pick: (param: { min: number; max: number }) => number) =>
        Object.fromEntries(asset.params.map((param) => [param.key, pick(param)]));
      expect(resolveAsset(asset, defaultParams(asset)).issues).toEqual([]);
      expect(resolveAsset(asset, at((param) => param.min)).issues).toEqual([]);
      expect(resolveAsset(asset, at((param) => param.max)).issues).toEqual([]);
    });

    // Red if every part is hard-edged: furniture needs rounded edges to look real (lamp excluded).
    it.skipIf(assetId === "asset_floor_lamp")("has at least one part with bevel > 0", () => {
      const resolved = resolveAsset(asset, defaultParams(asset));
      expect(resolved.parts.some((part) => part.bevel > 0)).toBe(true);
    });
  });

  // Red if the sofa size leaves the plausible range or the cushion part is dropped.
  it("sofa is 1.6-2.6 m wide and uses a cushion part", () => {
    const sofa = getAsset("asset_sofa");
    const { min, max } = resolveAsset(sofa, defaultParams(sofa)).boundingBox;
    expect(max[0] - min[0]).toBeGreaterThanOrEqual(1.6);
    expect(max[0] - min[0]).toBeLessThanOrEqual(2.6);
    expect(sofa.parts.some((part) => part.shape === "cushion")).toBe(true);
  });

  // Red if the bed is not a 160 cm bed.
  it("bed is 1.6-1.8 m wide and 2.0-2.2 m long", () => {
    const bed = getAsset("asset_bed_160");
    const { min, max } = resolveAsset(bed, defaultParams(bed)).boundingBox;
    expect(max[0] - min[0]).toBeGreaterThanOrEqual(1.6);
    expect(max[0] - min[0]).toBeLessThanOrEqual(1.8);
    expect(max[2] - min[2]).toBeGreaterThanOrEqual(2.0);
    expect(max[2] - min[2]).toBeLessThanOrEqual(2.2);
  });

  // Red if the chair height is off (seat ~0.45 m, back up to 0.75-1.0 m).
  it("chair is 0.75-1.0 m high", () => {
    const chair = getAsset("asset_chair");
    const { max } = resolveAsset(chair, defaultParams(chair)).boundingBox;
    expect(max[1]).toBeGreaterThanOrEqual(0.75);
    expect(max[1]).toBeLessThanOrEqual(1.0);
  });

  // Red if the lamp height or its light source changes out of range.
  it("floor lamp is 1.4-1.9 m high and carries a 800-3000 lm, 2400-3000 K light", () => {
    const lamp = getAsset("asset_floor_lamp");
    const resolved = resolveAsset(lamp, defaultParams(lamp));
    expect(resolved.boundingBox.max[1]).toBeGreaterThanOrEqual(1.4);
    expect(resolved.boundingBox.max[1]).toBeLessThanOrEqual(1.9);
    const lit = resolved.parts.filter((part) => part.light);
    expect(lit.length).toBeGreaterThanOrEqual(1);
    for (const part of lit) {
      expect(part.light!.lumens).toBeGreaterThanOrEqual(800);
      expect(part.light!.lumens).toBeLessThanOrEqual(3000);
      expect(part.light!.kelvin).toBeGreaterThanOrEqual(2400);
      expect(part.light!.kelvin).toBeLessThanOrEqual(3000);
    }
  });

  // Red if the shelf loses its count param or the repeat that it drives.
  it("shelf has a count param driving a repeat", () => {
    const shelf = getAsset("asset_shelf");
    expect(shelf.params.some((param) => param.unit === "count")).toBe(true);
    expect(shelf.parts.some((part) => part.repeat)).toBe(true);
  });
});

describe("buildSeedSql", () => {
  const sql = buildSeedSql();
  // Every '...'::jsonb literal, with doubled single quotes un-doubled, parsed back to a value.
  const jsonLiterals: string[] = [...sql.matchAll(/'((?:[^']|'')*)'::jsonb/g)].map((match) =>
    JSON.stringify(JSON.parse(match[1]!.replaceAll("''", "'"))),
  );
  const hasLiteral = (value: unknown) => jsonLiterals.includes(JSON.stringify(JSON.parse(JSON.stringify(value))));

  // Red if a table is missed.
  it("inserts into documents, assets and materials", () => {
    for (const table of ["documents", "assets", "materials"]) {
      expect(sql).toMatch(new RegExp(`insert\\s+into\\s+(public\\.)?${table}\\b`, "i"));
    }
  });

  // Red if re-running the seed would fail or duplicate rows.
  it("is idempotent: every insert is guarded by on conflict (id) do nothing", () => {
    const inserts = sql.match(/insert\s+into\s+(public\.)?(documents|assets|materials)\b/gi) ?? [];
    const guards = sql.match(/on\s+conflict\s*\(id\)\s*do\s+nothing/gi) ?? [];
    expect(inserts.length).toBeGreaterThanOrEqual(3);
    expect(guards.length).toBeGreaterThanOrEqual(inserts.length);
  });

  // Red if jsonb serialization or quote escaping corrupts the document.
  it("embeds the document's apartment, items and lighting as parseable jsonb", () => {
    expect(hasLiteral(SEED_DOCUMENT.apartment)).toBe(true);
    expect(hasLiteral(SEED_DOCUMENT.items)).toBe(true);
    expect(hasLiteral(SEED_DOCUMENT.lighting)).toBe(true);
  });

  // Red if asset params/parts or material maps are not serialized faithfully.
  it("embeds asset params and parts and material maps as parseable jsonb", () => {
    for (const asset of SEED_ASSETS) {
      expect(hasLiteral(asset.params), `${asset.id} params`).toBe(true);
      expect(hasLiteral(asset.parts), `${asset.id} parts`).toBe(true);
    }
    for (const material of SEED_MATERIALS) expect(hasLiteral(material.maps), material.id).toBe(true);
  });

  // Statement containing the insert for the given table and entity id.
  const statements = sql.split(/;\s*\n/);
  const insertFor = (table: string, id: string) =>
    statements.find((statement) =>
      new RegExp(`insert\\s+into\\s+(public\\.)?${table}\\b`, "i").test(statement) && statement.includes(`'${id}'`));

  // Red if content_hash is missing, stale or computed differently from hash.ts.
  it("writes assetContentHash / materialContentHash into each insert", () => {
    for (const asset of SEED_ASSETS) {
      expect(insertFor("assets", asset.id), `${asset.id} insert`).toContain(assetContentHash(asset));
    }
    for (const material of SEED_MATERIALS) {
      expect(insertFor("materials", material.id), `${material.id} insert`).toContain(materialContentHash(material));
    }
  });

  // Red if the update runs before the document exists (foreign key violation on app_state).
  it("updates app_state after the documents insert", () => {
    const insertIndex = sql.search(/insert\s+into\s+(public\.)?documents\b/i);
    const updateIndex = sql.search(/update\s+(public\.)?app_state/i);
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(updateIndex).toBeGreaterThan(insertIndex);
  });

  // Red if the seed document is not activated.
  it("sets app_state.active_document_id to the seed document id", () => {
    expect(sql).toMatch(/update\s+(public\.)?app_state/i);
    expect(sql).toMatch(new RegExp(`active_document_id\\s*=\\s*'${SEED_DOCUMENT.id}'`));
  });
});
