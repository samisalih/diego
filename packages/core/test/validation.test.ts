import { describe, expect, it } from "vitest";
import { z } from "zod";
import { itemSchema } from "../src/schemas/item.ts";
import { materialSchema } from "../src/schemas/material.ts";
import { safeParseWithIssues } from "../src/validation.ts";
import { buildValidItem, buildValidMaterial } from "./fixtures.ts";

function issuesFor(schema: z.ZodType, input: unknown) {
  const result = safeParseWithIssues(schema, input);
  if (result.ok) throw new Error("expected the schema to reject the input");
  return result.issues;
}

describe("toValidationIssues", () => {
  // Red when any of the four keys is missing or has the wrong content.
  it("maps a range violation to field, value, allowed and message", () => {
    const schema = z.object({ thickness: z.number().min(0.05).max(1) });
    const [issue, ...rest] = issuesFor(schema, { thickness: 5 });
    expect(rest).toHaveLength(0);
    expect(issue).toBeDefined();
    expect(issue!.field).toBe("thickness");
    expect(issue!.value).toBe(5);
    expect(issue!.allowed).toEqual(expect.any(String));
    expect(issue!.allowed.length).toBeGreaterThan(0);
    expect(issue!.message).toEqual(expect.any(String));
    expect(issue!.message.length).toBeGreaterThan(0);
  });

  // Red when `allowed` is a generic zod message instead of the bounds.
  it("describes numeric bounds in `allowed`", () => {
    const schema = z.object({ thickness: z.number().min(0.05).max(1) });
    const [issue] = issuesFor(schema, { thickness: 5 });
    expect(issue!.allowed).toContain("0.05");
    expect(issue!.allowed).toContain("1");
    expect(issue!.allowed).toMatch(/number/);
  });

  // Red when enum options are not listed in declaration order in the spec format.
  it("describes enum options as `one of: ...`", () => {
    const schema = z.object({ type: z.enum(["window", "door", "balconyDoor"]) });
    const [issue] = issuesFor(schema, { type: "gate" });
    expect(issue!.field).toBe("type");
    expect(issue!.value).toBe("gate");
    expect(issue!.allowed).toBe("one of: window, door, balconyDoor");
  });

  // Red when nested paths are not joined with dots.
  it("joins nested object paths with dots", () => {
    const schema = z.object({ a: z.object({ b: z.object({ c: z.number() }) }) });
    const [issue] = issuesFor(schema, { a: { b: { c: "x" } } });
    expect(issue!.field).toBe("a.b.c");
    expect(issue!.value).toBe("x");
  });

  // Red when array entries with an id are addressed by index.
  it("addresses array entries that have an id by id", () => {
    const schema = z.object({ walls: z.array(z.object({ id: z.string(), thickness: z.number().max(1) })) });
    const input = { walls: [{ id: "wall_x", thickness: 0.2 }, { id: "wall_a", thickness: 3 }] };
    const [issue] = issuesFor(schema, input);
    expect(issue!.field).toBe("walls.wall_a.thickness");
    expect(issue!.value).toBe(3);
  });

  // Red when entries without an id are not addressed by index.
  it("addresses array entries without an id by index", () => {
    const schema = z.object({ polygon: z.array(z.tuple([z.number(), z.number()])) });
    const [issue] = issuesFor(schema, { polygon: [[0, 0], [1, "y"]] });
    expect(issue!.field).toBe("polygon.1.1");
    expect(issue!.value).toBe("y");
  });

  // Red when only the first issue is reported.
  it("reports every issue", () => {
    const schema = z.object({ a: z.number(), b: z.string() });
    const issues = issuesFor(schema, { a: "x", b: 1 });
    expect(issues.map((i) => i.field).sort()).toEqual(["a", "b"]);
  });

  // Red when a missing key crashes the value lookup or yields something other than undefined.
  it("reports undefined as value for a missing field", () => {
    const [issue] = issuesFor(z.object({ name: z.string() }), {});
    expect(issue!.field).toBe("name");
    expect(issue!.value).toBeUndefined();
  });

  // Red when custom (superRefine) issues lose their path or message.
  it("maps custom issues with their path and message", () => {
    const schema = z.object({ a: z.number() }).superRefine((_value, ctx) => {
      ctx.addIssue({ code: "custom", path: ["a"], message: "a is bogus" });
    });
    const [issue] = issuesFor(schema, { a: 1 });
    expect(issue!.field).toBe("a");
    expect(issue!.value).toBe(1);
    expect(issue!.message).toContain("a is bogus");
  });
});

describe("allowed text for bounds", () => {
  // Red if an exclusive lower bound (positive) is described as "at least 0" / "between".
  it("describes a material tileSize of 0 as greater than 0", () => {
    const input = { ...buildValidMaterial(), tileSize: 0 };
    const issue = issuesFor(materialSchema, input).find((candidate) => candidate.field === "tileSize");
    expect(issue?.allowed).toMatch(/greater than 0/);
  });

  // Red if the exclusive upper bound (lt 360) is described as inclusive.
  it("describes an item rotation of 360 as below 360", () => {
    const input = { ...buildValidItem(), rotation: 360 };
    const issue = issuesFor(itemSchema, input).find((candidate) => candidate.field === "rotation");
    expect(issue?.allowed).toMatch(/below 360|less than 360/);
    expect(issue?.allowed).not.toMatch(/at most 360/);
  });

  // Red if inclusive ranges lose the "between X and Y" wording.
  it("keeps inclusive ranges as between X and Y", () => {
    const schema = z.object({ factor: z.number().min(0).max(2) });
    const [issue] = issuesFor(schema, { factor: 5 });
    expect(issue!.allowed).toMatch(/between 0 and 2/);
  });
});

describe("global zod config", () => {
  // Red if importing validation.ts installs a global customError (affects every other zod user).
  it("does not install a global customError", () => {
    expect(z.config().customError).toBeUndefined();
  });

  // Red if direct zod parsing yields a message altered by the validation module.
  it("leaves zod's default messages untouched for direct parsing", () => {
    const result = z.number().min(1).safeParse(0);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.message).toBe("Too small: expected number to be >=1");
  });
});
