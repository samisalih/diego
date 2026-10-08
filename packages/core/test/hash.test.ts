import { describe, expect, it } from "vitest";
import { assetContentHash, contentHash, materialContentHash, modelContentHash } from "../src/hash.ts";
import { buildValidAsset, buildValidMaterial, buildValidModel } from "./fixtures.ts";

describe("contentHash", () => {
  // Reference values: FNV-1a 64-bit over the UTF-8 bytes of JSON.stringify with sorted keys,
  // computed independently with BigInt. Red when algorithm, offset basis, prime or serialisation differ.
  it.each([
    ["", "07cc7607b4949e25"],
    [null, "5b9bc4ba528108e4"],
    [1, "af63ac4c86019afc"],
    [{ a: 1, b: 2 }, "a0ebc03bdc71de7b"],
    [[1, 2, 3], "28bbee4398699f19"],
    [{ b: [1, { c: null }], a: { y: "s", x: true } }, "36de8e43a7935ccd"],
  ])("hashes %j to the FNV-1a 64 reference value", (value, expected) => {
    expect(contentHash(value)).toBe(expected);
  });

  // Red when the output is not 16 lowercase hex chars (e.g. leading zeros dropped).
  it("always returns 16 lowercase hex chars", () => {
    for (const value of ["", 0, "a", { k: "v" }, [1], true]) {
      expect(contentHash(value)).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  // Red when keys are serialised in insertion order.
  it("ignores key order, also in nested objects", () => {
    const a = { x: 1, nested: { p: 1, q: [{ m: 1, n: 2 }] } };
    const b = { nested: { q: [{ n: 2, m: 1 }], p: 1 }, x: 1 };
    expect(contentHash(a)).toBe(contentHash(b));
  });

  // Red when undefined properties are serialised or change the hash.
  it("drops undefined properties", () => {
    expect(contentHash({ a: 1, b: undefined })).toBe(contentHash({ a: 1 }));
  });

  // Red when array order is normalised away.
  it("is sensitive to array order", () => {
    expect(contentHash([1, 2])).not.toBe(contentHash([2, 1]));
  });

  // Red when values are coerced (1 vs "1") or compared loosely.
  it("distinguishes types and values", () => {
    expect(contentHash(1)).not.toBe(contentHash("1"));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
    expect(contentHash({ a: null })).not.toBe(contentHash({}));
  });
});

describe("assetContentHash", () => {
  // Red when id is part of the hash.
  it("ignores the id", () => {
    const a = buildValidAsset();
    const b = { ...buildValidAsset(), id: "asset_other" };
    expect(assetContentHash(a as never)).toBe(assetContentHash(b as never));
  });

  // Red when anything besides id is dropped or the function hashes a different shape.
  it("equals contentHash of the asset without id", () => {
    const { id: _id, ...rest } = buildValidAsset();
    expect(assetContentHash(buildValidAsset() as never)).toBe(contentHash(rest));
  });

  // Red when key order leaks into the hash.
  it("ignores key order", () => {
    const a = buildValidAsset();
    const reordered = Object.fromEntries(Object.entries(a).reverse());
    expect(assetContentHash(reordered as never)).toBe(assetContentHash(a as never));
  });

  // Red when only top-level fields are hashed.
  it("changes when a nested part field changes", () => {
    const changed = buildValidAsset();
    changed.parts[0]!.h = 0.2;
    expect(assetContentHash(changed as never)).not.toBe(assetContentHash(buildValidAsset() as never));
  });

  it("changes when the name changes", () => {
    const changed = { ...buildValidAsset(), name: "Sessel" };
    expect(assetContentHash(changed as never)).not.toBe(assetContentHash(buildValidAsset() as never));
  });
});

describe("materialContentHash", () => {
  // Red when id is part of the hash.
  it("ignores the id", () => {
    const other = { ...buildValidMaterial(), id: "mat_other" };
    expect(materialContentHash(other as never)).toBe(materialContentHash(buildValidMaterial() as never));
  });

  // Red when content changes are not reflected.
  it("changes when content changes", () => {
    const changed = { ...buildValidMaterial(), tileSize: 1 };
    expect(materialContentHash(changed as never)).not.toBe(materialContentHash(buildValidMaterial() as never));
  });

  // Red when the function hashes the id-bearing object.
  it("equals contentHash of the material without id", () => {
    const { id: _id, ...rest } = buildValidMaterial();
    expect(materialContentHash(buildValidMaterial() as never)).toBe(contentHash(rest));
  });
});

describe("modelContentHash", () => {
  it("ignores the id", () => {
    const other = { ...buildValidModel(), id: "model_other" };
    expect(modelContentHash(other as never)).toBe(modelContentHash(buildValidModel() as never));
  });

  // Red when nested bounding box changes are ignored.
  it("changes when the bounding box changes", () => {
    const changed = buildValidModel();
    changed.boundingBox.max = [0.2, 0.3, 0.1];
    expect(modelContentHash(changed as never)).not.toBe(modelContentHash(buildValidModel() as never));
  });

  it("equals contentHash of the model without id", () => {
    const { id: _id, ...rest } = buildValidModel();
    expect(modelContentHash(buildValidModel() as never)).toBe(contentHash(rest));
  });
});
