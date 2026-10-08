import { z } from "zod";

export type ValidationIssue = { field: string; value: unknown; allowed: string; message: string };

export type Result<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

type RawIssue = z.core.$ZodRawIssue;

// A failing check only knows its own bound; the opposite bound lives in the sibling checks of the schema.
function findBounds(issue: RawIssue & { code: "too_small" | "too_big" }): { min?: number | bigint; max?: number | bigint } {
  let min = issue.code === "too_small" ? issue.minimum : undefined;
  let max = issue.code === "too_big" ? issue.maximum : undefined;
  const checks = (issue as { schema?: z.core.$ZodType }).schema?._zod.def.checks ?? [];
  for (const check of checks) {
    const def = check._zod.def as { check: string; value?: number | bigint; minimum?: number | bigint; maximum?: number | bigint };
    if (def.check === "greater_than") min ??= def.value;
    if (def.check === "min_length") min ??= def.minimum;
    if (def.check === "less_than") max ??= def.value;
    if (def.check === "max_length") max ??= def.maximum;
  }
  return { min, max };
}

function describeRange(issue: RawIssue & { code: "too_small" | "too_big" }): string {
  const { min, max } = findBounds(issue);
  const noun = issue.origin === "number" ? "number" : `${issue.origin} length`;
  if (min !== undefined && max !== undefined) return `${noun} between ${min} and ${max}`;
  if (min !== undefined) return `${noun} of at least ${min}`;
  return `${noun} of at most ${max}`;
}

function describeAllowed(issue: RawIssue): string | undefined {
  switch (issue.code) {
    case "too_small":
    case "too_big":
      return describeRange(issue);
    case "invalid_value":
      return `one of: ${issue.values.join(", ")}`;
    case "invalid_type":
      return issue.expected;
    case "invalid_format":
      return `string matching ${issue.pattern ?? issue.format}`;
    default:
      return undefined;
  }
}

// zod's finalised issues no longer know their schema, so the bounds are captured while the raw issue is
// still alive; zod copies the own keys of the raw issue (including `allowed`) into the final issue.
z.config({
  customError: (issue) => {
    Object.assign(issue, { allowed: describeAllowed(issue) });
    return undefined;
  },
});

function getEntry(container: unknown, key: PropertyKey): unknown {
  return container !== null && typeof container === "object" ? (container as Record<PropertyKey, unknown>)[key] : undefined;
}

function hasStringId(entry: unknown): entry is { id: string } {
  return typeof getEntry(entry, "id") === "string";
}

function toFieldAndValue(path: PropertyKey[], input: unknown): { field: string; value: unknown } {
  const segments: string[] = [];
  let current = input;
  for (const key of path) {
    const entry = getEntry(current, key);
    segments.push(Array.isArray(current) && hasStringId(entry) ? entry.id : String(key));
    current = entry;
  }
  return { field: segments.join("."), value: current };
}

export function toValidationIssues(error: z.ZodError, input: unknown): ValidationIssue[] {
  return error.issues.map((issue) => ({
    ...toFieldAndValue(issue.path, input),
    allowed: (issue as { allowed?: string }).allowed ?? issue.message,
    message: issue.message,
  }));
}
