import { describe, expect, it } from "vitest";
import { decodeToon, detectFormat, encodeToon } from "../src/toon.ts";
import {
  buildValidAsset,
  buildValidDocument,
  buildValidMaterial,
  buildValidModel,
} from "./fixtures.ts";

function buildBundle() {
  const { id: _id, source: _source, ...content } = buildValidDocument();
  const asset = buildValidAsset();
  // A lathe part with formula strings inside nested profile arrays.
  asset.parts.push({
    id: "part_vase",
    name: "Vase, \"gross\": rund",
    shape: "lathe",
    x: 0,
    y: 0.5,
    z: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    w: 0.2,
    h: 0.3,
    d: 0.2,
    bevel: 0,
    profile: [
      ["= width - 0.1", 0],
      [0.1, "= width / 2 + 0.1"],
    ],
  } as never);
  return {
    format: "apartment-planner" as const,
    version: 1 as const,
    document: content,
    assets: [asset],
    materials: [buildValidMaterial()],
    models: [buildValidModel()],
  };
}

function roundtrip(value: unknown): unknown {
  return decodeToon(encodeToon(value));
}

describe("encodeToon / decodeToon roundtrip", () => {
  // Red when encode or decode drops, reorders or retypes any field of a document.
  it("roundtrips a full document", () => {
    const document = buildValidDocument();
    expect(roundtrip(document)).toEqual(document);
  });

  // Red when the bundle (assets, materials, models, nested apartment) does not survive the roundtrip.
  it("roundtrips an export bundle JSON -> TOON -> JSON", () => {
    const bundle = buildBundle();
    const viaToon = decodeToon(encodeToon(bundle));
    expect(viaToon).toEqual(JSON.parse(JSON.stringify(bundle)));
  });

  // Red when the encoder does not use the tabular block form for uniform primitive arrays
  // (the whole point of TOON: token savings), or uses another indent / delimiter.
  it("encodes uniform item arrays as a tabular block with comma delimiter", () => {
    const text = encodeToon({
      items: [
        { id: "item_a", x: 1, z: 2 },
        { id: "item_b", x: 3, z: 4 },
      ],
    });
    expect(text).toBe("items[2]{id,x,z}:\n  item_a,1,2\n  item_b,3,4");
  });

  // Red when nested objects are not indented with exactly 2 spaces.
  it("indents nested objects by two spaces", () => {
    expect(encodeToon({ apartment: { meta: { name: "A" } } })).toBe(
      "apartment:\n  meta:\n    name: A",
    );
  });

  // Red when the encoder fails to quote strings containing delimiters, colons, quotes
  // or ambiguous literals, so that decode returns something else.
  it("roundtrips strings with commas, colons, quotes and ambiguous literals", () => {
    const value = {
      strings: [
        "a,b",
        "c: d",
        'say "hi"',
        "back\\slash",
        "= width - 0.1",
        "true",
        "null",
        "123",
        "",
        "  padded  ",
        "line1\nline2",
        "- dash",
        "[3]",
      ],
    };
    expect(roundtrip(value)).toEqual(value);
  });

  // Red when non-ASCII text is escaped lossy or mangled.
  it("roundtrips German umlauts", () => {
    const value = { rooms: [{ name: "Wohnzimmer" }, { name: "Küche & Bäder, groß" }], note: "Ünderschrank ß" };
    expect(roundtrip(value)).toEqual(value);
  });

  // Red when formula strings in part fields, including nested profile arrays, are altered.
  it("roundtrips part profiles with formula strings", () => {
    const part = {
      id: "part_x",
      w: "= width - 0.1",
      profile: [
        ["= width - 0.1", 0],
        [0.1, "=width/2"],
      ],
    };
    expect(roundtrip(part)).toEqual(part);
  });

  // Red when empty arrays / empty objects / null are dropped or turned into undefined or "".
  it("roundtrips empty arrays, empty objects and null values", () => {
    const value = { list: [], obj: {}, nothing: null, nested: { list: [], nothing: null }, referenceImages: {} };
    expect(roundtrip(value)).toEqual(value);
  });

  // Red when numbers lose precision or type (e.g. 0.1 -> "0.1", 1e-3 -> 0).
  it("roundtrips numbers and booleans with their type", () => {
    const value = { a: 0.1, b: -2.5, c: 0.001, d: 0, e: true, f: false, g: 1000000 };
    expect(roundtrip(value)).toEqual(value);
  });

  // Red when decode accepts invalid TOON silently instead of throwing.
  it("throws on invalid TOON", () => {
    expect(() => decodeToon("items[2]{id,x}:\n  a,1")).toThrow();
  });
});

describe("detectFormat", () => {
  it("detects a JSON object", () => {
    expect(detectFormat('{"a":1}')).toBe("json");
  });

  it("detects a JSON array", () => {
    expect(detectFormat("[1,2,3]")).toBe("json");
  });

  // Red when detection looks at the raw first char instead of the trimmed one.
  it("ignores leading whitespace and newlines", () => {
    expect(detectFormat('  \n\t {"a":1}')).toBe("json");
    expect(detectFormat("\n\n  name: Demo\n")).toBe("toon");
  });

  // Red when the BOM is treated as content (first char would be U+FEFF, not "{").
  it("ignores a UTF-8 byte order mark", () => {
    expect(detectFormat('﻿{"a":1}')).toBe("json");
    expect(detectFormat("﻿name: Demo")).toBe("toon");
  });

  it("detects TOON", () => {
    expect(detectFormat("name: Demo\nitems[1]{id}:\n  a")).toBe("toon");
  });

  // Red when the fence line is not stripped before looking at the first char.
  it("looks through a ```json code fence", () => {
    expect(detectFormat('```json\n{"a":1}\n```')).toBe("json");
  });

  // Red when a fence is always taken as JSON (or as TOON) regardless of content.
  it("looks through a ```toon code fence", () => {
    expect(detectFormat("```toon\nname: Demo\n```")).toBe("toon");
  });

  // Red when fence + BOM + whitespace are not combined.
  it("handles BOM, whitespace and fence together", () => {
    expect(detectFormat('﻿ \n```json\n  {"a":1}\n```\n')).toBe("json");
  });
});
