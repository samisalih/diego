import { z } from "zod";

export type ValidationIssue = { field: string; value: unknown; allowed: string; message: string };

export type Result<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

type RawIssue = z.core.$ZodRawIssue;
type RangeIssue = RawIssue & { code: "too_small" | "too_big" };
type Bound = { value: number | bigint; inclusive: boolean };

type CheckDef = {
  check: string;
  value?: number | bigint;
  minimum?: number | bigint;
  maximum?: number | bigint;
  inclusive?: boolean;
};

// A failing check only knows its own bound; the opposite bound lives in the sibling checks of the schema.
function findBounds(issue: RangeIssue): { lower?: Bound; upper?: Bound } {
  let lower: Bound | undefined;
  let upper: Bound | undefined;
  if (issue.code === "too_small") lower = { value: issue.minimum, inclusive: issue.inclusive ?? true };
  else upper = { value: issue.maximum, inclusive: issue.inclusive ?? true };
  const checks = (issue as { schema?: z.core.$ZodType }).schema?._zod.def.checks ?? [];
  for (const check of checks) {
    const def = check._zod.def as CheckDef;
    if (def.check === "greater_than") lower ??= { value: def.value!, inclusive: def.inclusive ?? true };
    if (def.check === "min_length") lower ??= { value: def.minimum!, inclusive: true };
    if (def.check === "less_than") upper ??= { value: def.value!, inclusive: def.inclusive ?? true };
    if (def.check === "max_length") upper ??= { value: def.maximum!, inclusive: true };
  }
  return { lower, upper };
}

function describeRange(issue: RangeIssue): string {
  const { lower, upper } = findBounds(issue);
  const noun = issue.origin === "number" ? "number" : `${issue.origin} length`;
  if (lower?.inclusive && upper?.inclusive) return `${noun} between ${lower.value} and ${upper.value}`;
  const parts = [
    lower && (lower.inclusive ? `of at least ${lower.value}` : `greater than ${lower.value}`),
    upper && (upper.inclusive ? `of at most ${upper.value}` : `below ${upper.value}`),
  ].filter((part) => part !== undefined);
  return `${noun} ${parts.join(" and ")}`;
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
function attachAllowed(issue: RawIssue): undefined {
  Object.assign(issue, { allowed: describeAllowed(issue) });
  return undefined;
}

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
    allowed: (issue as { allowed?: string }).allowed ?? describeAllowed(issue as RawIssue) ?? issue.message,
    message: issue.message,
  }));
}

export function safeParseWithIssues<T>(schema: z.ZodType<T>, input: unknown): Result<T> {
  const parsed = schema.safeParse(input, { error: attachAllowed });
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, issues: toValidationIssues(parsed.error, input) };
}
