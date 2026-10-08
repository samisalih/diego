import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { appStateSchema } from "../src/schemas/app-state.ts";
import { apartmentMetaSchema, apartmentSchema } from "../src/schemas/apartment.ts";
import { assetSchema } from "../src/schemas/asset.ts";
import { documentContentSchema, documentSchema } from "../src/schemas/document.ts";
import { itemSchema } from "../src/schemas/item.ts";
import { lightingSchema } from "../src/schemas/lighting.ts";
import { materialSchema } from "../src/schemas/material.ts";
import { modelSchema } from "../src/schemas/model.ts";
import { toValidationIssues } from "../src/validation.ts";
import {
  buildValidAppState,
  buildValidApartment,
  buildValidAsset,
  buildValidDocument,
  buildValidItem,
  buildValidLighting,
  buildValidMaterial,
  buildValidModel,
} from "./fixtures.ts";

// Naming assumption (spec: "every schema exports the schema and the inferred type"): schema constants are
// camelCase with a `Schema` suffix (`apartmentSchema`, `apartmentMetaSchema`), types are PascalCase.

function issuesOf(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected the schema to reject the input");
  return toValidationIssues(result.error, input);
}

function fieldsOf(schema: z.ZodType, input: unknown): string[] {
  return issuesOf(schema, input).map((issue) => issue.field);
}

function expectRejectedAt(schema: z.ZodType, input: unknown, field: string) {
  expect(fieldsOf(schema, input)).toContain(field);
}

function expectRejectedUnder(schema: z.ZodType, input: unknown, prefix: string) {
  expect(fieldsOf(schema, input).some((field) => field.startsWith(prefix))).toBe(true);
}

function expectAccepted(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(`expected acceptance, got: ${JSON.stringify(toValidationIssues(result.error, input))}`);
  }
}

const longString = (length: number) => "x".repeat(length);

// ---------------------------------------------------------------------------------------------------------
describe("apartmentMetaSchema", () => {
  const meta = () => buildValidApartment().meta;

  it("accepts the fixture meta unchanged", () => {
    expect(apartmentMetaSchema.parse(meta())).toEqual(meta());
  });

  // Red when the defaults (longitude 10, Europe/Berlin) are dropped or changed.
  it("fills the defaults for longitude and timeZone", () => {
    const { longitude: _longitude, timeZone: _timeZone, ...rest } = meta();
    const parsed = apartmentMetaSchema.parse(rest);
    expect(parsed.longitude).toBe(10);
    expect(parsed.timeZone).toBe("Europe/Berlin");
  });

  // Red when a bound is off by one step or inclusive/exclusive is swapped.
  it.each([
    ["name", "", false],
    ["name", "x", true],
    ["name", longString(120), true],
    ["name", longString(121), false],
    ["ceilingHeight", 1.99, false],
    ["ceilingHeight", 2, true],
    ["ceilingHeight", 5, true],
    ["ceilingHeight", 5.01, false],
    ["northAngle", -0.1, false],
    ["northAngle", 0, true],
    ["northAngle", 359.99, true],
    ["northAngle", 360, false],
    ["latitude", -90.01, false],
    ["latitude", -90, true],
    ["latitude", 90, true],
    ["latitude", 90.01, false],
    ["longitude", -180.01, false],
    ["longitude", -180, true],
    ["longitude", 180, true],
    ["longitude", 180.01, false],
  ] as const)("%s = %j accepted: %s", (key, value, accepted) => {
    const input = { ...meta(), [key]: value };
    if (accepted) expectAccepted(apartmentMetaSchema, input);
    else expectRejectedAt(apartmentMetaSchema, input, key);
  });

  // Red when the IANA name is not checked against Intl.
  it("rejects a time zone Intl does not know", () => {
    expectRejectedAt(apartmentMetaSchema, { ...meta(), timeZone: "Mars/Olympus_Mons" }, "timeZone");
  });

  it("accepts other valid IANA zones", () => {
    expectAccepted(apartmentMetaSchema, { ...meta(), timeZone: "America/New_York" });
  });

  it.each(["name", "ceilingHeight", "northAngle", "latitude"] as const)("requires %s", (key) => {
    const input: Record<string, unknown> = { ...meta() };
    delete input[key];
    expectRejectedAt(apartmentMetaSchema, input, key);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("apartmentSchema", () => {
  it("accepts the valid fixture unchanged", () => {
    expect(apartmentSchema.parse(buildValidApartment())).toEqual(buildValidApartment());
  });

  // ---- rooms
  describe("rooms", () => {
    it("rejects a room name that is empty or longer than 80 chars", () => {
      const empty = buildValidApartment();
      empty.rooms[0]!.name = "";
      expectRejectedAt(apartmentSchema, empty, "rooms.room_living.name");
      const long = buildValidApartment();
      long.rooms[0]!.name = longString(81);
      expectRejectedAt(apartmentSchema, long, "rooms.room_living.name");
      const edge = buildValidApartment();
      edge.rooms[0]!.name = longString(80);
      expectAccepted(apartmentSchema, edge);
    });

    // Red when the minimum of 3 polygon points is not enforced.
    it("rejects a polygon with fewer than 3 points", () => {
      const input = buildValidApartment();
      input.rooms[0]!.polygon = [[0, 0], [4, 0]];
      expectRejectedAt(apartmentSchema, input, "rooms.room_living.polygon");
    });

    it("accepts a triangle", () => {
      const input = buildValidApartment();
      input.rooms[0]!.polygon = [[0, 0], [4, 0], [0, 3]];
      expectAccepted(apartmentSchema, input);
    });

    // Red when a repeated closing point is tolerated.
    it("rejects a polygon whose last point repeats the first", () => {
      const input = buildValidApartment();
      input.rooms[0]!.polygon = [[0, 0], [4, 0], [4, 3], [0, 3], [0, 0]];
      expectRejectedAt(apartmentSchema, input, "rooms.room_living.polygon");
    });

    it("rejects a polygon point that is not a number pair", () => {
      const input = buildValidApartment() as { rooms: { polygon: unknown[] }[] };
      input.rooms[0]!.polygon = [[0, 0], [4, 0], [4, "x"]];
      expectRejectedUnder(apartmentSchema, input, "rooms.room_living.polygon");
    });

    it("rejects an id with the wrong prefix", () => {
      const input = buildValidApartment();
      input.rooms[0]!.id = "wall_living";
      expect(fieldsOf(apartmentSchema, input).some((f) => f.endsWith("id"))).toBe(true);
    });

    // Red when material references are not validated as mat_* ids.
    it.each(["floorMaterialId", "wallMaterialId", "ceilingMaterialId"] as const)(
      "validates %s as a mat_ id and allows null",
      (key) => {
        const bad = buildValidApartment();
        Object.assign(bad.rooms[1]!, { [key]: "asset_oak" });
        expectRejectedAt(apartmentSchema, bad, `rooms.room_bedroom.${key}`);

        const nullable = buildValidApartment();
        Object.assign(nullable.rooms[1]!, { [key]: null });
        expectAccepted(apartmentSchema, nullable);

        const valid = buildValidApartment();
        Object.assign(valid.rooms[1]!, { [key]: "mat_oak" });
        expectAccepted(apartmentSchema, valid);
      },
    );

    it("accepts the estimated flag", () => {
      const input = buildValidApartment();
      Object.assign(input.rooms[0]!, { estimated: true });
      expectAccepted(apartmentSchema, input);
    });
  });

  // ---- walls
  describe("walls", () => {
    // Red when thickness bounds drift (spec example path: walls.<id>.thickness).
    it.each([
      [0.04, false],
      [0.05, true],
      [1, true],
      [1.01, false],
    ])("thickness %j accepted: %s", (thickness, accepted) => {
      const input = buildValidApartment();
      input.walls[1]!.thickness = thickness;
      if (accepted) expectAccepted(apartmentSchema, input);
      else expectRejectedAt(apartmentSchema, input, "walls.wall_s.thickness");
    });

    // Red when "length must be > 0.05" becomes >= or is dropped.
    it("rejects a wall of length exactly 0.05 and accepts one slightly longer", () => {
      const exact = buildValidApartment();
      exact.walls.push({ id: "wall_stub", startX: 1, startZ: 1, endX: 1.05, endZ: 1, thickness: 0.1, exterior: false });
      expectRejectedUnder(apartmentSchema, exact, "walls.wall_stub");

      const longer = buildValidApartment();
      longer.walls.push({ id: "wall_stub", startX: 1, startZ: 1, endX: 1.06, endZ: 1, thickness: 0.1, exterior: false });
      expectAccepted(apartmentSchema, longer);
    });

    it("rejects a zero-length wall", () => {
      const input = buildValidApartment();
      input.walls.push({ id: "wall_dot", startX: 1, startZ: 1, endX: 1, endZ: 1, thickness: 0.1, exterior: false });
      expectRejectedUnder(apartmentSchema, input, "walls.wall_dot");
    });

    // Red when the length uses only one axis.
    it("measures the length along both axes", () => {
      const input = buildValidApartment();
      input.walls.push({ id: "wall_diag", startX: 1, startZ: 1, endX: 1.04, endZ: 1.04, thickness: 0.1, exterior: false });
      expectAccepted(apartmentSchema, input); // sqrt(2) * 0.04 = 0.0566 > 0.05
    });

    it("requires the exterior flag to be boolean", () => {
      const input = buildValidApartment() as { walls: Record<string, unknown>[] };
      input.walls[0]!.exterior = "yes";
      expectRejectedAt(apartmentSchema, input, "walls.wall_n.exterior");
    });

    it("requires the coordinates to be finite numbers", () => {
      const input = buildValidApartment() as { walls: Record<string, unknown>[] };
      input.walls[0]!.endX = "7";
      expectRejectedAt(apartmentSchema, input, "walls.wall_n.endX");
    });
  });

  // ---- openings
  describe("openings", () => {
    it("restricts the type to window, door, balconyDoor", () => {
      const input = buildValidApartment() as { openings: Record<string, unknown>[] };
      input.openings[0]!.type = "gate";
      const issue = issuesOf(apartmentSchema, input).find((i) => i.field === "openings.opening_window.type");
      expect(issue).toBeDefined();
      expect(issue!.value).toBe("gate");
      expect(issue!.allowed).toBe("one of: window, door, balconyDoor");
    });

    // Red when any bound of width/height/sill/offset drifts. Rejection of a bound may legitimately also
    // trigger a cross-field issue, so only the presence of the field-level issue is asserted.
    it.each([
      ["offsetFromStart", -0.01],
      ["width", 0.19],
      ["width", 5.01],
      ["height", 0.19],
      ["height", 3.01],
      ["sillHeight", -0.01],
      ["sillHeight", 2.51],
    ] as const)("%s = %j is rejected at its own field", (key, value) => {
      const input = buildValidApartment();
      Object.assign(input.openings[0]!, { [key]: value });
      expectRejectedAt(apartmentSchema, input, `openings.opening_window.${key}`);
    });

    it("accepts the lower bounds of width, height and offset", () => {
      const input = buildValidApartment();
      Object.assign(input.openings[0]!, { offsetFromStart: 0, width: 0.2, height: 0.2, sillHeight: 0 });
      expectAccepted(apartmentSchema, input);
    });

    it("validates frameMaterialId as mat_ id and allows null", () => {
      const bad = buildValidApartment();
      Object.assign(bad.openings[0]!, { frameMaterialId: "model_x1" });
      expectRejectedAt(apartmentSchema, bad, "openings.opening_window.frameMaterialId");
      const ok = buildValidApartment();
      Object.assign(ok.openings[0]!, { frameMaterialId: null });
      expectAccepted(apartmentSchema, ok);
    });
  });

  // ---- cross-field rules
  describe("cross-field rules", () => {
    // Red when id uniqueness is not checked for a list.
    it.each([
      ["rooms", "room_living"],
      ["walls", "wall_n"],
      ["openings", "opening_window"],
    ] as const)("rejects duplicate ids in %s", (list, duplicateId) => {
      const input = buildValidApartment();
      const entries = input[list] as { id: string }[];
      entries.push({ ...structuredClone(entries.find((e) => e.id === duplicateId)!) });
      expectRejectedUnder(apartmentSchema, input, `${list}.`);
    });

    // Red when the wall reference is not resolved.
    it("rejects an opening that references a missing wall", () => {
      const input = buildValidApartment();
      input.openings[0]!.wallId = "wall_missing";
      expectRejectedAt(apartmentSchema, input, "openings.opening_window.wallId");
    });

    // Red when the span check is dropped or becomes strict (<) instead of <=.
    it("allows an opening to end exactly at the wall end", () => {
      const input = buildValidApartment();
      Object.assign(input.openings[0]!, { offsetFromStart: 5.5, width: 1.5 }); // wall_s is 7 m long
      expectAccepted(apartmentSchema, input);
    });

    it("rejects an opening that extends beyond the wall end", () => {
      const input = buildValidApartment();
      Object.assign(input.openings[0]!, { offsetFromStart: 5.9, width: 1.2 });
      const own = fieldsOf(apartmentSchema, input).filter((f) => f.startsWith("openings.opening_window."));
      expect(own.length).toBeGreaterThan(0);
      expect(own.every((f) => ["offsetFromStart", "width"].includes(f.split(".")[2]!))).toBe(true);
    });

    it("uses the length of the referenced wall (shorter wall -> rejected)", () => {
      const input = buildValidApartment();
      Object.assign(input.openings[1]!, { offsetFromStart: 2.5, width: 0.9 }); // wall_mid is 3 m long
      expectRejectedUnder(apartmentSchema, input, "openings.opening_door.");
    });

    // Red when sill + height is compared against something else than meta.ceilingHeight.
    it("allows sillHeight + height to equal the ceiling height", () => {
      const input = buildValidApartment();
      Object.assign(input.openings[0]!, { sillHeight: 1, height: 1.6 }); // ceiling 2.6
      expectAccepted(apartmentSchema, input);
    });

    it("rejects sillHeight + height above the ceiling height", () => {
      const input = buildValidApartment();
      Object.assign(input.openings[0]!, { sillHeight: 1, height: 1.7 });
      const own = fieldsOf(apartmentSchema, input).filter((f) => f.startsWith("openings.opening_window."));
      expect(own.length).toBeGreaterThan(0);
      expect(own.every((f) => ["sillHeight", "height"].includes(f.split(".")[2]!))).toBe(true);
    });

    it("follows the ceiling height of the meta block", () => {
      const input = buildValidApartment();
      input.meta.ceilingHeight = 2.1; // window: 0.9 + 1.2 = 2.1 fits, door: 0 + 2.1 fits
      expectAccepted(apartmentSchema, input);
      input.meta.ceilingHeight = 2;
      expectRejectedUnder(apartmentSchema, input, "openings.");
    });

    // Red when the door sill rule (0..0.05) is dropped or only applied to one door type.
    it.each(["door", "balconyDoor"] as const)("limits the sillHeight of a %s to 0..0.05", (type) => {
      const base = () => {
        const input = buildValidApartment();
        Object.assign(input.openings[1]!, { type });
        return input;
      };
      const ok = base();
      ok.openings[1]!.sillHeight = 0.05;
      expectAccepted(apartmentSchema, ok);

      const bad = base();
      bad.openings[1]!.sillHeight = 0.06;
      expectRejectedAt(apartmentSchema, bad, "openings.opening_door.sillHeight");
    });

    // Red when the door rule leaks onto windows.
    it("does not apply the door sill rule to windows", () => {
      const input = buildValidApartment();
      input.openings[0]!.sillHeight = 1.0;
      expectAccepted(apartmentSchema, input);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("itemSchema", () => {
  it("accepts the valid fixture unchanged", () => {
    expect(itemSchema.parse(buildValidItem())).toEqual(buildValidItem());
  });

  it("accepts a null or missing name and clampedParams", () => {
    expectAccepted(itemSchema, { ...buildValidItem(), name: null });
    const { name: _name, ...withoutName } = buildValidItem();
    expectAccepted(itemSchema, withoutName);
    expectAccepted(itemSchema, { ...buildValidItem(), clampedParams: ["width"] });
  });

  // Interpretation: "normalised to [0, 360)" means the schema rejects values outside that range.
  it.each([
    [-0.1, false],
    [0, true],
    [359.99, true],
    [360, false],
    [720, false],
  ])("rotation %j accepted: %s", (rotation, accepted) => {
    const input = { ...buildValidItem(), rotation };
    if (accepted) expectAccepted(itemSchema, input);
    else expectRejectedAt(itemSchema, input, "rotation");
  });

  // Red when slider values are not numbers.
  it("rejects non-numeric param values at the param key", () => {
    expectRejectedAt(itemSchema, { ...buildValidItem(), params: { width: "wide" } }, "params.width");
  });

  it("rejects a wrong assetId prefix", () => {
    expectRejectedAt(itemSchema, { ...buildValidItem(), assetId: "item_sofa" }, "assetId");
  });

  it("rejects a wrong id prefix", () => {
    expectRejectedAt(itemSchema, { ...buildValidItem(), id: "asset_sofa_1" }, "id");
  });

  it.each(["x", "z"] as const)("rejects a non-finite %s", (key) => {
    expectRejectedAt(itemSchema, { ...buildValidItem(), [key]: Number.NaN }, key);
    expectRejectedAt(itemSchema, { ...buildValidItem(), [key]: "1" }, key);
  });

  it.each(["locked", "hidden", "lightOn"] as const)("requires %s", (key) => {
    const input: Record<string, unknown> = { ...buildValidItem() };
    delete input[key];
    expectRejectedAt(itemSchema, input, key);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("lightingSchema", () => {
  it("accepts the valid fixture unchanged", () => {
    expect(lightingSchema.parse(buildValidLighting())).toEqual(buildValidLighting());
  });

  it.each([
    [-0.1, false],
    [0, true],
    [24, true],
    [24.1, false],
  ])("time %j accepted: %s", (time, accepted) => {
    const input = { ...buildValidLighting(), time };
    if (accepted) expectAccepted(lightingSchema, input);
    else expectRejectedAt(lightingSchema, input, "time");
  });

  it("restricts season to the four seasons", () => {
    const issue = issuesOf(lightingSchema, { ...buildValidLighting(), season: "monsoon" }).find((i) => i.field === "season");
    expect(issue).toBeDefined();
    expect(issue!.allowed).toBe("one of: winter, spring, summer, autumn");
  });

  // Red when the default of lampShadowsEnabled is not false.
  it("defaults lampShadowsEnabled to false", () => {
    const { lampShadowsEnabled: _flag, ...rest } = buildValidLighting();
    expect(lightingSchema.parse(rest).lampShadowsEnabled).toBe(false);
  });

  it("requires effectsEnabled", () => {
    const { effectsEnabled: _flag, ...rest } = buildValidLighting();
    expectRejectedAt(lightingSchema, rest, "effectsEnabled");
  });

  it("accepts a preset id, null and a missing preset; rejects an unknown preset", () => {
    expectAccepted(lightingSchema, { ...buildValidLighting(), presetId: "goldenHour" });
    expectAccepted(lightingSchema, { ...buildValidLighting(), presetId: null });
    const { presetId: _preset, ...rest } = buildValidLighting();
    expectAccepted(lightingSchema, rest);
    expectRejectedAt(lightingSchema, { ...buildValidLighting(), presetId: "disco" }, "presetId");
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("assetSchema", () => {
  it("accepts the valid fixture (params, formula part, repeat) unchanged", () => {
    expect(assetSchema.parse(buildValidAsset())).toEqual(buildValidAsset());
  });

  // ---- params
  describe("params", () => {
    // Red when the reserved names are not blocked (they are formula scope variables).
    it.each(["i", "count", "pi"])("rejects the reserved key %s", (key) => {
      const input = buildValidAsset();
      input.params[0]!.key = key;
      expectRejectedUnder(assetSchema, input, "params.0");
    });

    // Red when the camelCase identifier rule is relaxed.
    it.each(["Width", "my-key", "1a", "with space", "snake_case", ""])("rejects the non-camelCase key %j", (key) => {
      const input = buildValidAsset();
      input.params[0]!.key = key;
      expectRejectedUnder(assetSchema, input, "params.0");
    });

    it.each(["a", "seatHeight", "legCount2"])("accepts the key %s", (key) => {
      const input = buildValidAsset();
      input.params[0]!.key = key;
      expectAccepted(assetSchema, input);
    });

    it("rejects duplicate param keys", () => {
      const input = buildValidAsset();
      input.params[1]!.key = "width";
      expectRejectedUnder(assetSchema, input, "params");
    });

    // Red when min < max is relaxed to <=.
    it("rejects min >= max", () => {
      const equal = buildValidAsset();
      Object.assign(equal.params[0]!, { min: 1, max: 1, default: 1 });
      expectRejectedUnder(assetSchema, equal, "params.0");
      const inverted = buildValidAsset();
      Object.assign(inverted.params[0]!, { min: 2, max: 1, default: 1.5 });
      expectRejectedUnder(assetSchema, inverted, "params.0");
    });

    // Red when default is not checked against min and max (inclusive).
    it("requires min <= default <= max, bounds inclusive", () => {
      const below = buildValidAsset();
      below.params[0]!.default = 0.5;
      expectRejectedAt(assetSchema, below, "params.0.default");
      const above = buildValidAsset();
      above.params[0]!.default = 3.1;
      expectRejectedAt(assetSchema, above, "params.0.default");
      const atMin = buildValidAsset();
      atMin.params[0]!.default = 0.6;
      expectAccepted(assetSchema, atMin);
      const atMax = buildValidAsset();
      atMax.params[0]!.default = 3;
      expectAccepted(assetSchema, atMax);
    });

    // Red when step may be zero or negative.
    it.each([0, -0.05])("rejects step %j", (step) => {
      const input = buildValidAsset();
      input.params[0]!.step = step;
      expectRejectedAt(assetSchema, input, "params.0.step");
    });

    it("restricts unit to m, deg, count, factor", () => {
      const bad = buildValidAsset();
      bad.params[0]!.unit = "cm";
      expectRejectedAt(assetSchema, bad, "params.0.unit");
      for (const unit of ["m", "deg", "count", "factor"]) {
        const ok = buildValidAsset();
        ok.params[0]!.unit = unit;
        expectAccepted(assetSchema, ok);
      }
    });

    it("requires a label", () => {
      const input = buildValidAsset() as { params: Record<string, unknown>[] };
      delete input.params[0]!.label;
      expectRejectedAt(assetSchema, input, "params.0.label");
    });
  });

  // ---- parts
  describe("parts", () => {
    it("rejects duplicate part ids", () => {
      const input = buildValidAsset();
      input.parts[1]!.id = "part_seat";
      expectRejectedUnder(assetSchema, input, "parts");
    });

    it("rejects an unknown shape", () => {
      const input = buildValidAsset();
      input.parts[0]!.shape = "pyramid";
      expectRejectedAt(assetSchema, input, "parts.part_seat.shape");
    });

    it.each(["box", "cylinder", "sphere", "capsule", "torus", "plane", "cushion"])("accepts shape %s", (shape) => {
      const input = buildValidAsset();
      input.parts[0]!.shape = shape;
      expectAccepted(assetSchema, input);
    });

    // Red when a numeric field accepts any string, or a formula without the leading '='.
    it.each(["x", "y", "z", "rx", "ry", "rz", "w", "h", "d", "bevel"] as const)(
      "accepts a formula and rejects a plain string in %s",
      (key) => {
        const ok = buildValidAsset();
        Object.assign(ok.parts[0]!, { [key]: "=width * 0.5" });
        expectAccepted(assetSchema, ok);

        const bad = buildValidAsset();
        Object.assign(bad.parts[0]!, { [key]: "width * 0.5" });
        expectRejectedAt(assetSchema, bad, `parts.part_seat.${key}`);
      },
    );

    it("rejects non-number, non-string field values", () => {
      const input = buildValidAsset();
      Object.assign(input.parts[0]!, { w: true });
      expectRejectedAt(assetSchema, input, "parts.part_seat.w");
    });

    it("requires the size fields", () => {
      const input = buildValidAsset() as { parts: Record<string, unknown>[] };
      delete input.parts[0]!.w;
      expectRejectedAt(assetSchema, input, "parts.part_seat.w");
    });

    // Red when rotation and bevel lose their default 0.
    it("defaults rx, ry, rz and bevel to 0", () => {
      const input = buildValidAsset() as { parts: Record<string, unknown>[] };
      for (const key of ["rx", "ry", "rz", "bevel"]) delete input.parts[0]![key];
      const parsed = assetSchema.parse(input);
      expect(parsed.parts[0]).toMatchObject({ rx: 0, ry: 0, rz: 0, bevel: 0 });
    });

    // Red when repeat.count accepts a formula without '=' or a non-numeric value.
    it("validates repeat.count as number or formula", () => {
      const ok = buildValidAsset();
      Object.assign(ok.parts[1]!, { repeat: { count: 3 } });
      expectAccepted(assetSchema, ok);
      const nullable = buildValidAsset();
      Object.assign(nullable.parts[1]!, { repeat: null });
      expectAccepted(assetSchema, nullable);
      const bad = buildValidAsset();
      Object.assign(bad.parts[1]!, { repeat: { count: "legCount" } });
      expectRejectedAt(assetSchema, bad, "parts.part_leg.repeat.count");
    });

    it("validates the light block", () => {
      const ok = buildValidAsset();
      Object.assign(ok.parts[0]!, { light: { lumens: "=width*100", kelvin: 2700, type: "spot" } });
      expectAccepted(assetSchema, ok);
      const bad = buildValidAsset();
      Object.assign(bad.parts[0]!, { light: { lumens: 800, kelvin: 2700, type: "laser" } });
      expectRejectedAt(assetSchema, bad, "parts.part_seat.light.type");
    });

    it("validates materialId as mat_ id and allows null", () => {
      const bad = buildValidAsset();
      Object.assign(bad.parts[0]!, { materialId: "model_oak" });
      expectRejectedAt(assetSchema, bad, "parts.part_seat.materialId");
      const ok = buildValidAsset();
      Object.assign(ok.parts[0]!, { materialId: null });
      expectAccepted(assetSchema, ok);
    });

    it("accepts the cushion fill and torus tube fields as number or formula", () => {
      const cushion = buildValidAsset();
      Object.assign(cushion.parts[0]!, { shape: "cushion", fill: "=0.5" });
      expectAccepted(assetSchema, cushion);
      const torus = buildValidAsset();
      Object.assign(torus.parts[0]!, { shape: "torus", tube: 0.02 });
      expectAccepted(assetSchema, torus);
    });

    // ---- profile rules
    // Red when the minimum profile length for lathe (2) is off.
    it("requires a lathe profile with at least 2 points", () => {
      const none = buildValidAsset();
      Object.assign(none.parts[0]!, { shape: "lathe" });
      expectRejectedAt(assetSchema, none, "parts.part_seat.profile");
      const one = buildValidAsset();
      Object.assign(one.parts[0]!, { shape: "lathe", profile: [[0.1, 0]] });
      expectRejectedAt(assetSchema, one, "parts.part_seat.profile");
      const two = buildValidAsset();
      Object.assign(two.parts[0]!, { shape: "lathe", profile: [[0.1, 0], ["=width", 0.5]] });
      expectAccepted(assetSchema, two);
    });

    // Red when the minimum profile length for extrude (3) is off.
    it("requires an extrude profile with at least 3 points", () => {
      const none = buildValidAsset();
      Object.assign(none.parts[0]!, { shape: "extrude" });
      expectRejectedAt(assetSchema, none, "parts.part_seat.profile");
      const two = buildValidAsset();
      Object.assign(two.parts[0]!, { shape: "extrude", profile: [[0, 0], [1, 0]] });
      expectRejectedAt(assetSchema, two, "parts.part_seat.profile");
      const three = buildValidAsset();
      Object.assign(three.parts[0]!, { shape: "extrude", profile: [[0, 0], [1, 0], [0, 1]] });
      expectAccepted(assetSchema, three);
    });

    // Red when profile coordinates accept plain strings.
    it("rejects a profile coordinate that is a string without '='", () => {
      const input = buildValidAsset();
      Object.assign(input.parts[0]!, { shape: "lathe", profile: [[0.1, 0], ["wide", 0.5]] });
      expectRejectedUnder(assetSchema, input, "parts.part_seat.profile");
    });

    it("does not require a profile for other shapes", () => {
      expectAccepted(assetSchema, buildValidAsset());
    });

    // ---- model rules
    // Red when the model shape is allowed without a modelId.
    it("requires a modelId for the model shape", () => {
      const missing = buildValidAsset();
      Object.assign(missing.parts[0]!, { shape: "model" });
      expectRejectedAt(assetSchema, missing, "parts.part_seat.modelId");
      const nullish = buildValidAsset();
      Object.assign(nullish.parts[0]!, { shape: "model", modelId: null });
      expectRejectedAt(assetSchema, nullish, "parts.part_seat.modelId");
      const ok = buildValidAsset();
      Object.assign(ok.parts[0]!, { shape: "model", modelId: "model_vase" });
      expectAccepted(assetSchema, ok);
    });

    it("rejects a modelId with the wrong prefix", () => {
      const input = buildValidAsset();
      Object.assign(input.parts[0]!, { shape: "model", modelId: "mat_vase" });
      expectRejectedAt(assetSchema, input, "parts.part_seat.modelId");
    });

    it("defaults scaleMode to fit for model parts and restricts its values", () => {
      const input = buildValidAsset();
      Object.assign(input.parts[0]!, { shape: "model", modelId: "model_vase" });
      expect(assetSchema.parse(input).parts[0]).toMatchObject({ scaleMode: "fit" });
      for (const scaleMode of ["uniform", "stretch", "fit"]) {
        const ok = buildValidAsset();
        Object.assign(ok.parts[0]!, { shape: "model", modelId: "model_vase", scaleMode });
        expectAccepted(assetSchema, ok);
      }
      const bad = buildValidAsset();
      Object.assign(bad.parts[0]!, { shape: "model", modelId: "model_vase", scaleMode: "squash" });
      expectRejectedAt(assetSchema, bad, "parts.part_seat.scaleMode");
    });
  });

  // ---- reference images
  describe("referenceImages", () => {
    const image = () => ({ path: "asset_sofa/front.png", opacity: 0.5 });

    it("accepts front, side and top images with optional calibration", () => {
      const input = buildValidAsset();
      Object.assign(input.referenceImages, {
        front: { ...image(), calibration: { a: [0, 0], b: [100, 0], lengthM: 1.8 } },
        side: { ...image(), calibration: null },
        top: image(),
      });
      expectAccepted(assetSchema, input);
    });

    it.each([
      [-0.1, false],
      [0, true],
      [1, true],
      [1.1, false],
    ])("opacity %j accepted: %s", (opacity, accepted) => {
      const input = buildValidAsset();
      Object.assign(input.referenceImages, { front: { ...image(), opacity } });
      if (accepted) expectAccepted(assetSchema, input);
      else expectRejectedAt(assetSchema, input, "referenceImages.front.opacity");
    });

    it("rejects a calibration point that is not a number pair", () => {
      const input = buildValidAsset();
      Object.assign(input.referenceImages, {
        front: { ...image(), calibration: { a: [0, 0, 0], b: [1, 0], lengthM: 1 } },
      });
      expectRejectedUnder(assetSchema, input, "referenceImages.front.calibration.a");
    });

    it("rejects an unknown view", () => {
      const input = buildValidAsset();
      Object.assign(input.referenceImages, { back: image() });
      // Strict or stripped is not specified; the view must at least never reach the parsed output.
      const result = assetSchema.safeParse(input);
      if (result.success) expect(result.data.referenceImages).not.toHaveProperty("back");
    });
  });

  it.each(["name", "category", "params", "parts", "referenceImages"] as const)("requires %s", (key) => {
    const input: Record<string, unknown> = { ...buildValidAsset() };
    delete input[key];
    expectRejectedAt(assetSchema, input, key);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("materialSchema", () => {
  it("accepts the valid fixture unchanged", () => {
    expect(materialSchema.parse(buildValidMaterial())).toEqual(buildValidMaterial());
  });

  it("accepts a minimal material and applies defaults", () => {
    const parsed = materialSchema.parse({
      id: "mat_plain",
      name: "Plain",
      source: "photo",
      license: "own work",
      maps: {},
      importStatus: "pending",
      tileSize: 1,
      fallbackColor: "#ffffff",
    });
    expect(parsed.roughnessFactor).toBe(1);
  });

  it.each([
    ["source", "textures4u"],
    ["importStatus", "done"],
    ["tileSize", 0],
    ["tileSize", -1],
    ["tint", "red"],
    ["tint", "#12345"],
    ["tint", "#12345g"],
    ["fallbackColor", "#fff"],
    ["fallbackColor", "a0784c"],
    ["roughnessFactor", -0.01],
    ["roughnessFactor", 2.01],
    ["metalnessFactor", -0.01],
    ["metalnessFactor", 1.01],
    ["id", "model_oak"],
  ] as const)("rejects %s = %j", (key, value) => {
    expectRejectedAt(materialSchema, { ...buildValidMaterial(), [key]: value }, key);
  });

  it.each([
    ["source", "polyhaven"],
    ["source", "ambientcg"],
    ["source", "photo"],
    ["importStatus", "pending"],
    ["importStatus", "failed"],
    ["tint", "#A0784C"],
    ["roughnessFactor", 0],
    ["roughnessFactor", 2],
    ["metalnessFactor", 0],
    ["metalnessFactor", 1],
    ["sourceId", null],
    ["sourceUrl", null],
  ] as const)("accepts %s = %j", (key, value) => {
    expectAccepted(materialSchema, { ...buildValidMaterial(), [key]: value });
  });

  it("rejects a map value that is not a string", () => {
    expectRejectedAt(materialSchema, { ...buildValidMaterial(), maps: { baseColor: 5 } }, "maps.baseColor");
  });

  it("accepts all six map slots", () => {
    const maps = { baseColor: "a", normal: "b", roughness: "c", metalness: "d", ao: "e", displacement: "f" };
    expectAccepted(materialSchema, { ...buildValidMaterial(), maps });
  });

  it("requires license and fallbackColor", () => {
    const { license: _license, ...noLicense } = buildValidMaterial();
    expectRejectedAt(materialSchema, noLicense, "license");
    const { fallbackColor: _color, ...noColor } = buildValidMaterial();
    expectRejectedAt(materialSchema, noColor, "fallbackColor");
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("modelSchema", () => {
  it("accepts the valid fixture unchanged", () => {
    expect(modelSchema.parse(buildValidModel())).toEqual(buildValidModel());
  });

  it.each(["upload", "polyhaven", "url"])("accepts source %s", (source) => {
    expectAccepted(modelSchema, { ...buildValidModel(), source });
  });

  it("rejects an unknown source", () => {
    expectRejectedAt(modelSchema, { ...buildValidModel(), source: "sketchfab" }, "source");
  });

  it("rejects a wrong id prefix", () => {
    expectRejectedAt(modelSchema, { ...buildValidModel(), id: "mat_vase" }, "id");
  });

  it("requires storagePath", () => {
    const { storagePath: _path, ...rest } = buildValidModel();
    expectRejectedAt(modelSchema, rest, "storagePath");
  });

  // Red when the bounding box tuples are not checked for length 3.
  it("rejects a bounding box corner that is not a 3-tuple", () => {
    const input = { ...buildValidModel(), boundingBox: { min: [0, 0], max: [1, 1, 1] } };
    expectRejectedUnder(modelSchema, input, "boundingBox.min");
  });

  it("requires boundingBox", () => {
    const { boundingBox: _box, ...rest } = buildValidModel();
    expectRejectedAt(modelSchema, rest, "boundingBox");
  });

  it("accepts a string license and rejects a numeric one", () => {
    expectAccepted(modelSchema, { ...buildValidModel(), license: "CC-BY 4.0" });
    expectRejectedAt(modelSchema, { ...buildValidModel(), license: 4 }, "license");
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("documentSchema", () => {
  it("accepts the valid fixture unchanged", () => {
    expect(documentSchema.parse(buildValidDocument())).toEqual(buildValidDocument());
  });

  it.each(["user", "ai", "import"])("accepts source %s", (source) => {
    expectAccepted(documentSchema, { ...buildValidDocument(), source });
  });

  it("rejects an unknown source", () => {
    expectRejectedAt(documentSchema, { ...buildValidDocument(), source: "robot" }, "source");
  });

  it("rejects a wrong id prefix", () => {
    expectRejectedAt(documentSchema, { ...buildValidDocument(), id: "item_demo" }, "id");
  });

  // Red when nested schemas are not wired in: path must run through apartment and the wall id.
  it("reports nested apartment errors by id path", () => {
    const input = buildValidDocument();
    input.apartment.walls[0]!.thickness = 2;
    expectRejectedAt(documentSchema, input, "apartment.walls.wall_n.thickness");
  });

  // Red when the cross-field rules are not part of the document.
  it("applies the apartment cross-field rules", () => {
    const input = buildValidDocument();
    input.apartment.openings[0]!.wallId = "wall_missing";
    expectRejectedAt(documentSchema, input, "apartment.openings.opening_window.wallId");
  });

  it("reports nested item errors by id path", () => {
    const input = buildValidDocument();
    input.items[0]!.rotation = 400;
    expectRejectedAt(documentSchema, input, "items.item_sofa_1.rotation");
  });

  it("reports nested lighting errors", () => {
    const input = buildValidDocument();
    input.lighting.time = 25;
    expectRejectedAt(documentSchema, input, "lighting.time");
  });
});

describe("documentContentSchema", () => {
  // Red when DocumentContent carries id/source or lacks one of its four fields.
  it("accepts name, apartment, items and lighting without id and source", () => {
    const { id: _id, source: _source, ...content } = buildValidDocument();
    expect(documentContentSchema.parse(content)).toEqual(content);
  });

  it.each(["name", "apartment", "items", "lighting"] as const)("requires %s", (key) => {
    const { id: _id, source: _source, ...content } = buildValidDocument();
    const input: Record<string, unknown> = { ...content };
    delete input[key];
    expectRejectedAt(documentContentSchema, input, key);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe("appStateSchema", () => {
  it("accepts the valid fixture unchanged", () => {
    expect(appStateSchema.parse(buildValidAppState())).toEqual(buildValidAppState());
  });

  it("accepts null camera, a populated aiBusyUntil and null ids", () => {
    expectAccepted(appStateSchema, {
      ...buildValidAppState(),
      camera: null,
      activeDocumentId: null,
      aiBusyUntil: "2026-10-08T12:00:00.000Z",
    });
  });

  // Red when an enum value list drifts.
  it.each([
    ["mode", "editor", "viewer"],
    ["mode", "documents", "viewer"],
    ["mode", "workshop", "viewer"],
    ["editorView", "firstPerson", "orbit"],
    ["renderMode", "photo", "draft"],
    ["workshopCamera", "top", "bottom"],
    ["workshopLight", "apartment", "night"],
  ] as const)("%s accepts %s and rejects %s", (key, good, bad) => {
    expectAccepted(appStateSchema, { ...buildValidAppState(), [key]: good });
    expectRejectedAt(appStateSchema, { ...buildValidAppState(), [key]: bad }, key);
  });

  it("validates id prefixes of the active ids", () => {
    expectRejectedAt(appStateSchema, { ...buildValidAppState(), activeDocumentId: "item_x1" }, "activeDocumentId");
    expectRejectedAt(appStateSchema, { ...buildValidAppState(), activeAssetId: "doc_x1" }, "activeAssetId");
    expectAccepted(appStateSchema, { ...buildValidAppState(), activeAssetId: "asset_sofa" });
  });

  // Red when the focal length range (10..200 mm) drifts.
  it.each([
    [9.9, false],
    [10, true],
    [200, true],
    [200.1, false],
  ])("camera.focalLength %j accepted: %s", (focalLength, accepted) => {
    const input = { ...buildValidAppState(), camera: { ...buildValidAppState().camera, focalLength } };
    if (accepted) expectAccepted(appStateSchema, input);
    else expectRejectedAt(appStateSchema, input, "camera.focalLength");
  });

  it("rejects a camera position that is not a 3-tuple", () => {
    const input = { ...buildValidAppState(), camera: { ...buildValidAppState().camera, position: [1, 2] } };
    expectRejectedUnder(appStateSchema, input, "camera.position");
  });

  it("rejects a measurement overlay entry with a malformed point", () => {
    const input = { ...buildValidAppState(), measurementOverlay: [{ from: [0, 0], to: [1, 0, 0] }] };
    expectRejectedUnder(appStateSchema, input, "measurementOverlay.0.from");
  });

  it("rejects a non-string selection entry", () => {
    expectRejectedUnder(appStateSchema, { ...buildValidAppState(), selection: [1] }, "selection");
  });

  it("requires photoResolution width and height", () => {
    const input = { ...buildValidAppState(), photoResolution: { width: 1920 } };
    expectRejectedAt(appStateSchema, input, "photoResolution.height");
  });

  it("rejects a non-string aiBusyUntil", () => {
    expectRejectedAt(appStateSchema, { ...buildValidAppState(), aiBusyUntil: 12 }, "aiBusyUntil");
  });
});
