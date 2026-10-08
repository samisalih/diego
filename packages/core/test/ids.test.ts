import { afterEach, describe, expect, it, vi } from "vitest";
import { ID_PREFIXES, createId, idSchema, isId } from "../src/ids.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ID_PREFIXES", () => {
  // Red when a prefix is added, removed or renamed.
  it("lists exactly the spec prefixes in order", () => {
    expect([...ID_PREFIXES]).toEqual([
      "doc", "item", "asset", "part", "mat", "model", "room", "wall", "opening",
    ]);
  });
});

describe("createId", () => {
  // Red when separator, body length or alphabet changes.
  it.each(ID_PREFIXES)("creates %s ids as prefix + underscore + 10 base36 chars", (prefix) => {
    expect(createId(prefix)).toMatch(new RegExp(`^${prefix}_[a-z0-9]{10}$`));
  });

  // Red when the generator is not random (e.g. a counter reset or constant).
  it("produces distinct ids across many calls", () => {
    const ids = new Set(Array.from({ length: 500 }, () => createId("item")));
    expect(ids.size).toBe(500);
  });

  // Red when randomness comes from anywhere but crypto.getRandomValues.
  it("draws its randomness from crypto.getRandomValues", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    createId("doc");
    expect(spy).toHaveBeenCalled();
  });

  // Red when digits are mapped to a different alphabet than base36 (0 is the first digit).
  it("maps zeroed randomness to the first base36 digit", () => {
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((array: ArrayBufferView) => {
      (array as Uint8Array).fill(0);
      return array;
    }) as typeof crypto.getRandomValues);
    expect(createId("room")).toBe("room_0000000000");
  });

  // Red when ids produced by createId do not satisfy isId.
  it.each(ID_PREFIXES)("creates ids that pass isId for %s", (prefix) => {
    expect(isId(createId(prefix), prefix)).toBe(true);
  });
});

describe("isId", () => {
  it.each([
    ["room_living", "room"],
    ["asset_sofa", "asset"],
    ["item_a", "item"], // body of exactly 1 char
    ["item_ab", "item"],
    ["item_a1-b_2", "item"],
    ["mat_0abc", "mat"],
  ] as const)("accepts %s as %s", (value, prefix) => {
    expect(isId(value, prefix)).toBe(true);
  });

  // Red when the minimum body length (1) is loosened or tightened.
  it("rejects an empty body", () => {
    expect(isId("item_", "item")).toBe(false);
  });

  // Red when the maximum body length (64) is off by one in either direction.
  it("accepts a 64-char body and rejects a 65-char body", () => {
    expect(isId(`item_${"a".repeat(64)}`, "item")).toBe(true);
    expect(isId(`item_${"a".repeat(65)}`, "item")).toBe(false);
  });

  // Red when the body-start rule [a-z0-9] is dropped.
  it.each(["item__ab", "item_-ab"])("rejects body starting with a separator: %s", (value) => {
    expect(isId(value, "item")).toBe(false);
  });

  // Red when uppercase or other characters are tolerated.
  it.each(["item_Abc", "item_ab c", "item_ab.c", "item_äb"])("rejects invalid body chars: %s", (value) => {
    expect(isId(value, "item")).toBe(false);
  });

  // Red when the prefix is not compared exactly.
  it("rejects a different prefix", () => {
    expect(isId("asset_sofa", "item")).toBe(false);
    expect(isId("model_vase", "mat")).toBe(false);
  });

  // Red when the prefix match is a plain startsWith without the underscore boundary.
  it("rejects a longer prefix that merely starts with the requested one", () => {
    expect(isId("docs_abc", "doc")).toBe(false);
  });

  // Red when the pattern is not anchored.
  it("rejects ids with leading or trailing garbage", () => {
    expect(isId(" item_abc", "item")).toBe(false);
    expect(isId("item_abc\n", "item")).toBe(false);
    expect(isId("xitem_abc", "item")).toBe(false);
  });

  // Red when non-strings throw or pass.
  it.each([null, undefined, 42, {}, []])("returns false for non-string %j", (value) => {
    expect(isId(value, "item")).toBe(false);
  });
});

describe("idSchema", () => {
  // Red when the schema does not accept what isId accepts.
  it("accepts a valid id and returns it unchanged", () => {
    expect(idSchema("asset").parse("asset_sofa")).toBe("asset_sofa");
  });

  // Red when the prefix is not enforced.
  it("rejects an id with a wrong prefix", () => {
    expect(idSchema("asset").safeParse("item_sofa").success).toBe(false);
  });

  // Red when the body pattern is not enforced.
  it("rejects a malformed body", () => {
    expect(idSchema("item").safeParse("item_A1").success).toBe(false);
    expect(idSchema("item").safeParse("item_").success).toBe(false);
    expect(idSchema("item").safeParse("item_a").success).toBe(true);
  });

  // Red when non-strings are coerced.
  it("rejects non-strings", () => {
    expect(idSchema("item").safeParse(5).success).toBe(false);
    expect(idSchema("item").safeParse(null).success).toBe(false);
  });
});
