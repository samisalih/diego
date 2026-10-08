import { describe, expect, it } from "vitest";
import { replaceMaterialReferences, upsertApartment } from "../src/operations/apartment.ts";
import {
  duplicateItems,
  placeItems,
  removeAssetFromContent,
  removeItems,
  restoreItemsToContent,
  updateItems,
} from "../src/operations/items.ts";
import { setDocumentName } from "../src/index.ts";
import { setLighting } from "../src/operations/lighting.ts";
import { replaceMaterialInAsset, upsertAssetDefinition } from "../src/operations/asset.ts";
import type { Asset } from "../src/schemas/asset.ts";
import type { DocumentContent } from "../src/schemas/document.ts";
import type { Item } from "../src/schemas/item.ts";
import { buildValidAsset, buildValidDocument, buildValidItem } from "./fixtures.ts";

// Assumed contracts (spec section 12 leaves them open):
// - content operations return OperationResult<DocumentContent>, changedIds = ids of added/changed/removed entities
// - `assets` parameters are Asset[]
// - removeAssetFromContent returns the plain { content, removedItems }; restoreItemsToContent returns plain DocumentContent
// - duplicateItems copies every field except id and position (so locked/hidden/lightOn/name/params are kept)

function buildContent(): DocumentContent {
  const { id: _id, source: _source, ...content } = buildValidDocument();
  return content as unknown as DocumentContent;
}

function buildSofa(): Asset {
  return buildValidAsset() as unknown as Asset;
}

// Asset with a light part; shares the sofa param set so item params stay valid.
function buildLamp(): Asset {
  const asset = buildValidAsset();
  const bulb = {
    id: "part_bulb",
    name: "Leuchtmittel",
    shape: "sphere",
    x: 0,
    y: 1,
    z: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    w: 0.1,
    h: 0.1,
    d: 0.1,
    bevel: 0,
    light: { lumens: 800, kelvin: 2700, type: "point" },
  };
  return { ...asset, id: "asset_lamp", name: "Lampe", parts: [...asset.parts, bulb] } as unknown as Asset;
}

function buildItem(overrides: Record<string, unknown> = {}): Item {
  return { ...buildValidItem(), ...overrides } as unknown as Item;
}

function buildAssets(): Asset[] {
  return [buildSofa(), buildLamp()];
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function expectOk<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got issues: ${JSON.stringify((result as { issues?: unknown }).issues)}`);
  return result as Extract<T, { ok: true }>;
}

function expectIssues<T extends { ok: boolean }>(result: T) {
  if (result.ok) throw new Error("expected issues, got ok");
  return (result as unknown as { issues: { field: string; value: unknown; allowed: string; message: string }[] }).issues;
}

function findItem(content: DocumentContent, id: string): Item {
  const item = content.items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`item ${id} not found`);
  return item;
}

describe("OperationResult shape", () => {
  // Red when ok results lack value/changedIds or failures lack a ValidationIssue list with all four keys.
  it("returns value and changedIds on success and structured issues on failure", () => {
    const success = expectOk(removeItems(buildContent(), ["item_sofa_1"]));
    expect(success.value.items).toEqual([]);
    expect(Array.isArray(success.changedIds)).toBe(true);

    const failure = removeItems(buildContent(), ["item_missing"]);
    expect(failure.ok).toBe(false);
    const [issue] = expectIssues(failure);
    expect(issue).toEqual({
      field: expect.any(String),
      value: expect.anything(),
      allowed: expect.any(String),
      message: expect.any(String),
    });
  });
});

describe("upsertApartment", () => {
  // Red when an existing entry is replaced instead of merged (other fields lost).
  it("merges given fields into an existing entry by id", () => {
    const result = expectOk(upsertApartment(buildContent(), { upsert: { walls: [{ id: "wall_mid", thickness: 0.2 } as never] } }));
    const wall = result.value.apartment.walls.find((candidate) => candidate.id === "wall_mid")!;
    expect(wall.thickness).toBe(0.2);
    expect(wall.startX).toBe(4);
    expect(wall.endZ).toBe(3);
    expect(wall.exterior).toBe(false);
    expect(result.value.apartment.walls).toHaveLength(5);
    expect(result.changedIds).toContain("wall_mid");
  });

  // Red when new complete entries are not appended or not reported in changedIds.
  it("creates complete new rooms, walls and openings", () => {
    const result = expectOk(
      upsertApartment(buildContent(), {
        upsert: {
          rooms: [{ id: "room_hall", name: "Flur", polygon: [[7, 0], [9, 0], [9, 3]] } as never],
          walls: [{ id: "wall_hall", startX: 7, startZ: 0, endX: 9, endZ: 0, thickness: 0.2, exterior: true } as never],
          openings: [
            { id: "opening_hall", wallId: "wall_hall", type: "window", offsetFromStart: 0.2, width: 1, height: 1, sillHeight: 0.9 } as never,
          ],
        },
      }),
    );
    expect(result.value.apartment.rooms.map((room) => room.id)).toContain("room_hall");
    expect(result.value.apartment.walls.map((wall) => wall.id)).toContain("wall_hall");
    expect(result.value.apartment.openings.map((opening) => opening.id)).toContain("opening_hall");
    expect(result.changedIds).toEqual(expect.arrayContaining(["room_hall", "wall_hall", "opening_hall"]));
  });

  // Red when a new entry with missing required fields is accepted (e.g. defaults invented).
  it("rejects a new wall that is incomplete", () => {
    const issues = expectIssues(upsertApartment(buildContent(), { upsert: { walls: [{ id: "wall_new", startX: 0 } as never] } }));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((issue) => issue.field.includes("wall_new"))).toBe(true);
  });

  // Red when meta is replaced instead of merged field-wise.
  it("merges a partial meta into the existing meta", () => {
    const result = expectOk(upsertApartment(buildContent(), { upsert: { meta: { name: "Neu" } } }));
    expect(result.value.apartment.meta).toEqual({ ...buildContent().apartment.meta, name: "Neu" });
  });

  // Red when meta values are not validated.
  it("rejects an out-of-range meta value", () => {
    const issues = expectIssues(upsertApartment(buildContent(), { upsert: { meta: { ceilingHeight: 10 } } }));
    expect(issues.some((issue) => issue.field.includes("ceilingHeight"))).toBe(true);
  });

  // Red when the cascade is missing, or the removed openings are not listed in changedIds.
  it("removes a wall together with its openings and lists both in changedIds", () => {
    const result = expectOk(upsertApartment(buildContent(), { remove: { walls: ["wall_mid"] } }));
    expect(result.value.apartment.walls.map((wall) => wall.id)).not.toContain("wall_mid");
    expect(result.value.apartment.openings.map((opening) => opening.id)).toEqual(["opening_window"]);
    expect(result.changedIds).toEqual(expect.arrayContaining(["wall_mid", "opening_door"]));
  });

  // Red when removing rooms/openings by id is not supported.
  it("removes rooms and openings by id", () => {
    const result = expectOk(upsertApartment(buildContent(), { remove: { rooms: ["room_bedroom"], openings: ["opening_window"] } }));
    expect(result.value.apartment.rooms.map((room) => room.id)).toEqual(["room_living"]);
    expect(result.value.apartment.openings.map((opening) => opening.id)).toEqual(["opening_door"]);
    expect(result.changedIds).toEqual(expect.arrayContaining(["room_bedroom", "opening_window"]));
  });

  // Red when unknown ids in remove are silently ignored.
  it("reports an unknown id in remove as an issue", () => {
    const issues = expectIssues(upsertApartment(buildContent(), { remove: { rooms: ["room_missing"] } }));
    expect(issues.some((issue) => JSON.stringify(issue).includes("room_missing"))).toBe(true);
  });

  // Red when the merged result is not validated against the cross-field apartment rules.
  it("rejects an opening that becomes too wide for its wall", () => {
    const issues = expectIssues(upsertApartment(buildContent(), { upsert: { openings: [{ id: "opening_window", width: 6.5 } as never] } }));
    expect(issues.some((issue) => issue.field.includes("opening_window"))).toBe(true);
  });

  // Red when the operation mutates its input (also throws on frozen input).
  it("never mutates its input", () => {
    const content = buildContent();
    const snapshot = structuredClone(content);
    deepFreeze(content);
    upsertApartment(content, { upsert: { meta: { name: "X" }, walls: [{ id: "wall_mid", thickness: 0.2 } as never] }, remove: { walls: ["wall_n"] } });
    expect(content).toEqual(snapshot);
  });
});

describe("placeItems", () => {
  // Red when no id is generated or it lacks the item_ prefix / body format; two items must differ.
  it("generates distinct item_ ids for items without an id", () => {
    const result = expectOk(placeItems(buildContent(), [{ assetId: "asset_sofa", x: 1, z: 1 }, { assetId: "asset_sofa", x: 2, z: 2 }], buildAssets()));
    const added = result.value.items.slice(1);
    expect(added).toHaveLength(2);
    for (const item of added) expect(item.id).toMatch(/^item_[a-z0-9]{10}$/);
    expect(added[0]!.id).not.toBe(added[1]!.id);
    expect(result.changedIds).toEqual(added.map((item) => item.id));
  });

  // Red when a given id is replaced by a generated one.
  it("keeps a provided id", () => {
    const result = expectOk(placeItems(buildContent(), [{ id: "item_mine", assetId: "asset_sofa", x: 1, z: 1 }], buildAssets()));
    expect(findItem(result.value, "item_mine").assetId).toBe("asset_sofa");
    expect(result.changedIds).toEqual(["item_mine"]);
  });

  // Red when any default (rotation 0, locked/hidden/lightOn false, params = asset defaults) is wrong.
  it("applies defaults", () => {
    const result = expectOk(placeItems(buildContent(), [{ id: "item_d", assetId: "asset_sofa", x: 1, z: 2 }], buildAssets()));
    expect(findItem(result.value, "item_d")).toMatchObject({
      x: 1,
      z: 2,
      rotation: 0,
      locked: false,
      hidden: false,
      lightOn: false,
      params: { width: 1.8, legCount: 4 },
    });
  });

  // Red when params are stored raw (not clamped, not rounded for count units, unknown keys kept).
  it("normalises params against the asset", () => {
    const result = expectOk(
      placeItems(buildContent(), [{ id: "item_p", assetId: "asset_sofa", x: 1, z: 1, params: { width: 10, legCount: 4.4, bogus: 1 } }], buildAssets()),
    );
    expect(findItem(result.value, "item_p").params).toEqual({ width: 3, legCount: 4 });
  });

  // Red when an unknown asset is accepted.
  it("reports an unknown asset as an issue", () => {
    const issues = expectIssues(placeItems(buildContent(), [{ id: "item_u", assetId: "asset_nope", x: 1, z: 1 }], buildAssets()));
    expect(issues.some((issue) => issue.field.includes("assetId"))).toBe(true);
  });

  // Red when the input content is mutated.
  it("never mutates its input", () => {
    const content = buildContent();
    const snapshot = structuredClone(content);
    deepFreeze(content);
    placeItems(content, [{ assetId: "asset_sofa", x: 1, z: 1 }], buildAssets());
    expect(content).toEqual(snapshot);
  });
});

describe("updateItems", () => {
  // Red when the patch replaces the item instead of merging.
  it("merges a patch into the existing item", () => {
    const result = expectOk(updateItems(buildContent(), [{ id: "item_sofa_1", x: 3, name: "Neu" }], buildAssets()));
    expect(findItem(result.value, "item_sofa_1")).toEqual({ ...buildItem(), x: 3, name: "Neu" });
    expect(result.changedIds).toEqual(["item_sofa_1"]);
  });

  // Red when rotation is not normalised before validation (450 and -90 would be rejected or stored raw).
  it("normalises rotation into [0, 360)", () => {
    const high = expectOk(updateItems(buildContent(), [{ id: "item_sofa_1", rotation: 450 }], buildAssets()));
    expect(findItem(high.value, "item_sofa_1").rotation).toBe(90);
    const negative = expectOk(updateItems(buildContent(), [{ id: "item_sofa_1", rotation: -90 }], buildAssets()));
    expect(findItem(negative.value, "item_sofa_1").rotation).toBe(270);
    const full = expectOk(updateItems(buildContent(), [{ id: "item_sofa_1", rotation: 360 }], buildAssets()));
    expect(findItem(full.value, "item_sofa_1").rotation).toBe(0);
  });

  // Red when a locked item can be moved or rotated; each field gets its own issue.
  it("rejects x, z and rotation changes on a locked item", () => {
    const content = buildContent();
    content.items = [buildItem({ locked: true })];
    const issues = expectIssues(updateItems(content, [{ id: "item_sofa_1", x: 9, z: 9, rotation: 10 }], buildAssets()));
    const fields = issues.map((issue) => issue.field);
    expect(fields).toEqual(expect.arrayContaining(["items.item_sofa_1.x", "items.item_sofa_1.z", "items.item_sofa_1.rotation"]));
  });

  // Red when the lock also blocks non-positional edits.
  it("allows non-positional changes on a locked item", () => {
    const content = buildContent();
    content.items = [buildItem({ locked: true })];
    const result = expectOk(updateItems(content, [{ id: "item_sofa_1", name: "Neu", hidden: true }], buildAssets()));
    expect(findItem(result.value, "item_sofa_1")).toMatchObject({ name: "Neu", hidden: true, locked: true });
  });

  // Red when the unlock escape hatch is missing.
  it("allows moving a locked item when the same patch sets locked to false", () => {
    const content = buildContent();
    content.items = [buildItem({ locked: true })];
    const result = expectOk(updateItems(content, [{ id: "item_sofa_1", locked: false, x: 9 }], buildAssets()));
    expect(findItem(result.value, "item_sofa_1")).toMatchObject({ locked: false, x: 9 });
  });

  // Red when an unknown id is ignored.
  it("reports an unknown id as an issue", () => {
    const issues = expectIssues(updateItems(buildContent(), [{ id: "item_missing", x: 1 }], buildAssets()));
    expect(issues.some((issue) => issue.field.includes("item_missing"))).toBe(true);
  });

  // Red when patched params are not re-normalised against the asset (clamp, count rounding, defaults for missing keys).
  it("re-normalises patched params", () => {
    const result = expectOk(updateItems(buildContent(), [{ id: "item_sofa_1", params: { width: 99 } }], buildAssets()));
    expect(findItem(result.value, "item_sofa_1").params).toEqual({ width: 3, legCount: 4 });
  });

  // Red when the input content is mutated.
  it("never mutates its input", () => {
    const content = buildContent();
    const snapshot = structuredClone(content);
    deepFreeze(content);
    updateItems(content, [{ id: "item_sofa_1", x: 3, rotation: 450 }], buildAssets());
    expect(content).toEqual(snapshot);
  });
});

describe("removeItems", () => {
  // Red when other items are removed too or changedIds misses the removed id.
  it("removes only the given items", () => {
    const content = buildContent();
    content.items = [buildItem(), buildItem({ id: "item_other" })];
    const result = expectOk(removeItems(content, ["item_other"]));
    expect(result.value.items.map((item) => item.id)).toEqual(["item_sofa_1"]);
    expect(result.changedIds).toEqual(["item_other"]);
  });

  // Red when unknown ids are ignored.
  it("reports an unknown id as an issue", () => {
    const issues = expectIssues(removeItems(buildContent(), ["item_missing"]));
    expect(issues.some((issue) => issue.field.includes("item_missing") || issue.value === "item_missing")).toBe(true);
  });
});

describe("duplicateItems", () => {
  // Red when the copy keeps the id, is not appended, or the original changes.
  it("appends copies with new ids and keeps the originals", () => {
    const result = expectOk(duplicateItems(buildContent(), ["item_sofa_1"]));
    expect(result.value.items).toHaveLength(2);
    expect(result.value.items[0]).toEqual(buildItem());
    const copy = result.value.items[1]!;
    expect(copy.id).toMatch(/^item_[a-z0-9]{10}$/);
    expect(copy.id).not.toBe("item_sofa_1");
    expect(result.changedIds).toEqual([copy.id]);
  });

  // Red when the default offset is not [0.1, 0.1].
  it("offsets the copy by [0.1, 0.1] by default", () => {
    const copy = expectOk(duplicateItems(buildContent(), ["item_sofa_1"])).value.items[1]!;
    expect(copy.x).toBeCloseTo(1.6, 10);
    expect(copy.z).toBeCloseTo(2.1, 10);
  });

  // Red when a custom offset is ignored or applied to the wrong axis.
  it("applies a custom offset as [dx, dz]", () => {
    const copy = expectOk(duplicateItems(buildContent(), ["item_sofa_1"], [1, 2])).value.items[1]!;
    expect(copy.x).toBeCloseTo(2.5, 10);
    expect(copy.z).toBeCloseTo(4, 10);
  });

  // Red when any field other than id/position is changed (decision: a copy of a locked item stays locked).
  it("keeps every field except id and position, including locked", () => {
    const content = buildContent();
    content.items = [buildItem({ locked: true, hidden: true, lightOn: true, clampedParams: ["width"] })];
    const copy = expectOk(duplicateItems(content, ["item_sofa_1"])).value.items[1]!;
    const { id: _id, x: _x, z: _z, ...rest } = copy;
    const { id: _oid, x: _ox, z: _oz, ...originalRest } = content.items[0]!;
    expect(rest).toEqual(originalRest);
    expect(copy.locked).toBe(true);
  });

  // Red when several ids produce colliding or missing copies.
  it("creates one distinct copy per id", () => {
    const content = buildContent();
    content.items = [buildItem(), buildItem({ id: "item_b" })];
    const result = expectOk(duplicateItems(content, ["item_sofa_1", "item_b"]));
    expect(result.value.items).toHaveLength(4);
    expect(new Set(result.value.items.map((item) => item.id)).size).toBe(4);
    expect(result.changedIds).toHaveLength(2);
  });

  // Red when unknown ids are ignored.
  it("reports an unknown id as an issue", () => {
    const issues = expectIssues(duplicateItems(buildContent(), ["item_missing"]));
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("setLighting", () => {
  function buildLampContent(): DocumentContent {
    const content = buildContent();
    content.items = [buildItem(), buildItem({ id: "item_lamp", assetId: "asset_lamp", lightOn: false }), buildItem({ id: "item_lamp_on", assetId: "asset_lamp", lightOn: true })];
    return content;
  }

  // Red when the patch replaces the lighting instead of merging.
  it("merges a patch into the lighting", () => {
    const result = expectOk(setLighting(buildContent(), { time: 20, season: "winter" }, buildAssets()));
    expect(result.value.lighting).toEqual({ ...buildContent().lighting, time: 20, season: "winter" });
  });

  // Red when the lighting is not validated.
  it("rejects an out-of-range time", () => {
    const issues = expectIssues(setLighting(buildContent(), { time: 30 }, buildAssets()));
    expect(issues.some((issue) => issue.field.includes("time"))).toBe(true);
  });

  // Red when allLamps leaks into the lighting, touches non-lamp items, or misses lamp items.
  it("switches all lamps on and leaves other items alone", () => {
    const result = expectOk(setLighting(buildLampContent(), { allLamps: true }, buildAssets()));
    expect(findItem(result.value, "item_lamp").lightOn).toBe(true);
    expect(findItem(result.value, "item_lamp_on").lightOn).toBe(true);
    expect(findItem(result.value, "item_sofa_1").lightOn).toBe(false);
    expect(result.value.lighting).toEqual(buildContent().lighting);
    expect(result.changedIds).toContain("item_lamp");
    expect(result.changedIds).not.toContain("item_sofa_1");
  });

  // Red when allLamps false does not switch lamps off or switches non-lamp items.
  it("switches all lamps off but never touches items without a light part", () => {
    const content = buildLampContent();
    content.items = content.items.map((item) => (item.id === "item_sofa_1" ? { ...item, lightOn: true } : item));
    const result = expectOk(setLighting(content, { allLamps: false }, buildAssets()));
    expect(findItem(result.value, "item_lamp_on").lightOn).toBe(false);
    expect(findItem(result.value, "item_lamp").lightOn).toBe(false);
    expect(findItem(result.value, "item_sofa_1").lightOn).toBe(true);
  });

  // Red when the input content is mutated.
  it("never mutates its input", () => {
    const content = buildLampContent();
    const snapshot = structuredClone(content);
    deepFreeze(content);
    setLighting(content, { time: 8, allLamps: true }, buildAssets());
    expect(content).toEqual(snapshot);
  });
});

describe("upsertAssetDefinition", () => {
  // Red when meta is not merged or other fields get lost.
  it("updates meta and keeps the rest", () => {
    const result = expectOk(upsertAssetDefinition(buildSofa(), { meta: { name: "Couch" } }));
    expect(result.value).toEqual({ ...buildSofa(), name: "Couch" });
  });

  // Red when params are not merged by key (existing key replaced whole, new key appended).
  it("upserts params by key", () => {
    const result = expectOk(
      upsertAssetDefinition(buildSofa(), {
        upsertParams: [
          { key: "width", max: 4 } as never,
          { key: "depth", label: "Tiefe", min: 0.5, max: 1.5, step: 0.05, default: 0.9, unit: "m" },
        ],
      }),
    );
    const width = result.value.params.find((param) => param.key === "width")!;
    expect(width).toMatchObject({ max: 4, min: 0.6, default: 1.8, label: "Breite" });
    expect(result.value.params.map((param) => param.key)).toEqual(["width", "legCount", "depth"]);
  });

  // Red when removeParams does not remove.
  it("removes params by key", () => {
    const result = expectOk(upsertAssetDefinition(buildSofa(), { removeParams: ["legCount"] }));
    expect(result.value.params.map((param) => param.key)).toEqual(["width"]);
  });

  // Red when parts are not merged by id (existing part replaced whole, new part appended).
  it("upserts parts by id", () => {
    const newPart = { id: "part_back", name: "Lehne", shape: "box", x: 0, y: 0.8, z: -0.4, rx: 0, ry: 0, rz: 0, w: "=width", h: 0.6, d: 0.1, bevel: 0 };
    const result = expectOk(upsertAssetDefinition(buildSofa(), { upsertParts: [{ id: "part_seat", h: 0.2 } as never, newPart as never] }));
    const seat = result.value.parts.find((part) => part.id === "part_seat")!;
    expect(seat).toMatchObject({ h: 0.2, w: "=width", name: "Sitzfläche" });
    expect(result.value.parts.map((part) => part.id)).toEqual(["part_seat", "part_leg", "part_back"]);
  });

  // Red when removeParts does not remove.
  it("removes parts by id", () => {
    const result = expectOk(upsertAssetDefinition(buildSofa(), { removeParts: ["part_leg"] }));
    expect(result.value.parts.map((part) => part.id)).toEqual(["part_seat"]);
  });

  // Red when the resulting asset is not validated.
  it("rejects a param whose range is inverted", () => {
    const issues = expectIssues(upsertAssetDefinition(buildSofa(), { upsertParams: [{ key: "width", min: 5 } as never] }));
    expect(issues.length).toBeGreaterThan(0);
  });

  // Red when an incomplete new part is accepted.
  it("rejects an incomplete new part", () => {
    const issues = expectIssues(upsertAssetDefinition(buildSofa(), { upsertParts: [{ id: "part_new", shape: "box" } as never] }));
    expect(issues.some((issue) => issue.field.includes("part_new"))).toBe(true);
  });

  // Red when the input asset is mutated.
  it("never mutates its input", () => {
    const asset = buildSofa();
    const snapshot = structuredClone(asset);
    deepFreeze(asset);
    upsertAssetDefinition(asset, { meta: { name: "X" }, removeParams: ["legCount"], removeParts: ["part_leg"] });
    expect(asset).toEqual(snapshot);
  });
});

describe("removeAssetFromContent and restoreItemsToContent", () => {
  function buildTwoAssetContent(): DocumentContent {
    const content = buildContent();
    content.items = [buildItem(), buildItem({ id: "item_sofa_2", x: 3 }), buildItem({ id: "item_lamp", assetId: "asset_lamp" })];
    return content;
  }

  // Red when items of other assets are removed or removedItems is incomplete.
  it("removes only items of the asset and returns them", () => {
    const { content, removedItems } = removeAssetFromContent(buildTwoAssetContent(), "asset_sofa");
    expect(content.items.map((item) => item.id)).toEqual(["item_lamp"]);
    expect(removedItems.map((item) => item.id)).toEqual(["item_sofa_1", "item_sofa_2"]);
    expect(removedItems[0]).toEqual(buildItem());
  });

  // Red when the roundtrip loses or alters items.
  it("restores removed items so that the content is equal again", () => {
    const original = buildTwoAssetContent();
    const { content, removedItems } = removeAssetFromContent(original, "asset_sofa");
    const restored = restoreItemsToContent(content, removedItems);
    const byId = (items: Item[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(restored.items)).toEqual(byId(original.items));
    expect(restored.apartment).toEqual(original.apartment);
    expect(restored.lighting).toEqual(original.lighting);
  });

  // Red when the input content is mutated.
  it("never mutates its input", () => {
    const content = buildTwoAssetContent();
    const snapshot = structuredClone(content);
    deepFreeze(content);
    const { removedItems } = removeAssetFromContent(content, "asset_sofa");
    restoreItemsToContent(content, removedItems);
    expect(content).toEqual(snapshot);
  });
});

describe("replaceMaterialReferences", () => {
  function buildMaterialContent(): DocumentContent {
    const content = buildContent();
    content.apartment.rooms[0] = { ...content.apartment.rooms[0]!, floorMaterialId: "mat_oak", wallMaterialId: "mat_oak", ceilingMaterialId: "mat_oak" };
    content.apartment.rooms[1] = { ...content.apartment.rooms[1]!, floorMaterialId: "mat_tile", wallMaterialId: "mat_tile" };
    content.apartment.openings[0] = { ...content.apartment.openings[0]!, frameMaterialId: "mat_oak" };
    content.apartment.openings[1] = { ...content.apartment.openings[1]!, frameMaterialId: "mat_tile" };
    return content;
  }

  // Red when any of floor/wall/ceiling/frame references is missed or foreign materials are touched.
  it("replaces room and opening references and leaves other materials alone", () => {
    const result = expectOk(replaceMaterialReferences(buildMaterialContent(), "mat_oak", "mat_beech"));
    const [living, bedroom] = result.value.apartment.rooms;
    expect(living).toMatchObject({ floorMaterialId: "mat_beech", wallMaterialId: "mat_beech", ceilingMaterialId: "mat_beech" });
    expect(bedroom).toMatchObject({ floorMaterialId: "mat_tile", wallMaterialId: "mat_tile" });
    const [window, door] = result.value.apartment.openings;
    expect(window!.frameMaterialId).toBe("mat_beech");
    expect(door!.frameMaterialId).toBe("mat_tile");
    expect(result.changedIds).toEqual(expect.arrayContaining(["room_living", "opening_window"]));
    expect(result.changedIds).not.toContain("room_bedroom");
    expect(result.changedIds).not.toContain("opening_door");
  });

  // Red when null replacement is not written as null (unsets the reference).
  it("sets references to null when the replacement is null", () => {
    const result = expectOk(replaceMaterialReferences(buildMaterialContent(), "mat_oak", null));
    expect(result.value.apartment.rooms[0]).toMatchObject({ floorMaterialId: null, wallMaterialId: null, ceilingMaterialId: null });
    expect(result.value.apartment.openings[0]!.frameMaterialId).toBeNull();
    expect(result.value.apartment.rooms[1]!.floorMaterialId).toBe("mat_tile");
  });

  // Red when the input content is mutated.
  it("never mutates its input", () => {
    const content = buildMaterialContent();
    const snapshot = structuredClone(content);
    deepFreeze(content);
    replaceMaterialReferences(content, "mat_oak", "mat_beech");
    expect(content).toEqual(snapshot);
  });
});

describe("replaceMaterialInAsset", () => {
  function buildMaterialAsset(): Asset {
    const asset = buildValidAsset();
    asset.parts[1] = { ...asset.parts[1]!, materialId: "mat_tile" } as never;
    return asset as unknown as Asset;
  }

  // Red when part references are not replaced or foreign materials are touched.
  it("replaces part material references and leaves other materials alone", () => {
    const result = expectOk(replaceMaterialInAsset(buildMaterialAsset(), "mat_oak", "mat_beech"));
    expect(result.value.parts.map((part) => part.materialId)).toEqual(["mat_beech", "mat_tile"]);
  });

  // Red when null replacement is not written as null.
  it("sets part references to null when the replacement is null", () => {
    const result = expectOk(replaceMaterialInAsset(buildMaterialAsset(), "mat_oak", null));
    expect(result.value.parts.map((part) => part.materialId)).toEqual([null, "mat_tile"]);
  });

  // Red when the input asset is mutated.
  it("never mutates its input", () => {
    const asset = buildMaterialAsset();
    const snapshot = structuredClone(asset);
    deepFreeze(asset);
    replaceMaterialInAsset(asset, "mat_oak", "mat_beech");
    expect(asset).toEqual(snapshot);
  });
});

describe("placeItems and updateItems hardening", () => {
  // Red if placeItems stores rotation unnormalised (schema range violation or raw value).
  it.each([
    [-90, 270],
    [450, 90],
  ])("placeItems normalises rotation %d to %d", (input, expected) => {
    const result = expectOk(placeItems(buildContent(), [{ id: "item_rot", assetId: "asset_sofa", x: 1, z: 1, rotation: input }], buildAssets()));
    expect(findItem(result.value, "item_rot").rotation).toBe(expected);
  });

  // Red if a params patch on an item with an unknown asset is silently applied.
  it("updateItems with a params patch reports an unknown asset", () => {
    const content = buildContent();
    content.items = [buildItem({ id: "item_orphan", assetId: "asset_gone" })];
    const issues = expectIssues(updateItems(content, [{ id: "item_orphan", params: { width: 2 } }], buildAssets()));
    const issue = issues.find((candidate) => candidate.field === "items.item_orphan.assetId");
    expect(issue).toBeDefined();
    expect(issue!.message).toMatch(/unknown asset/i);
  });

  // Red if placeItems allows an id that already exists (duplicate item ids).
  it("placeItems rejects an id that already exists in the document", () => {
    const result = placeItems(buildContent(), [{ id: "item_sofa_1", assetId: "asset_sofa", x: 1, z: 1 }], buildAssets());
    expect(result.ok).toBe(false);
  });
});

// Contract: docs/specs/editor.md section 4.2 - setDocumentName(content, name), name length 1..120.
// Assumption: changedIds is empty (the document name belongs to no entity id).
describe("setDocumentName", () => {
  // Red when the name is not written, or other content parts are touched.
  it("sets the name and leaves everything else untouched", () => {
    const content = buildContent();
    const result = expectOk(setDocumentName(content, "Neue Wohnung"));
    expect(result.value.name).toBe("Neue Wohnung");
    expect(result.value.apartment).toEqual(content.apartment);
    expect(result.value.items).toEqual(content.items);
    expect(result.value.lighting).toEqual(content.lighting);
  });

  // Red when the input content is mutated instead of copied.
  it("does not mutate the input content", () => {
    const content = deepFreeze(buildContent());
    expect(() => setDocumentName(content, "Andere")).not.toThrow();
  });

  // Red when the length bounds are off by one (1 and 120 are valid).
  it("accepts names of 1 and 120 characters", () => {
    expect(expectOk(setDocumentName(buildContent(), "a")).value.name).toBe("a");
    expect(expectOk(setDocumentName(buildContent(), "b".repeat(120))).value.name).toHaveLength(120);
  });

  // Red when an empty or too long name is accepted.
  it("rejects an empty name and a name of 121 characters with a structured issue on the name field", () => {
    for (const name of ["", "c".repeat(121)]) {
      const [issue] = expectIssues(setDocumentName(buildContent(), name));
      expect(issue).toEqual({
        field: expect.stringContaining("name"),
        value: expect.anything(),
        allowed: expect.any(String),
        message: expect.any(String),
      });
    }
  });
});
