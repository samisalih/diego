import type { z } from "zod";
import { toValidationIssues, type ValidationIssue } from "../validation.ts";

export type OperationResult<T> = { ok: true; value: T; changedIds: string[] } | { ok: false; issues: ValidationIssue[] };

export function ok<T>(value: T, changedIds: string[]): OperationResult<T> {
  return { ok: true, value, changedIds: [...new Set(changedIds)] };
}

export function fail(issues: ValidationIssue[]): { ok: false; issues: ValidationIssue[] } {
  return { ok: false, issues };
}

export function validateResult<T>(schema: z.ZodType<T>, candidate: unknown, changedIds: string[]): OperationResult<T> {
  const parsed = schema.safeParse(candidate);
  return parsed.success ? ok(parsed.data, changedIds) : fail(toValidationIssues(parsed.error, candidate));
}

export function unknownIdIssue(field: string, id: string, noun: string): ValidationIssue {
  return { field, value: id, allowed: `an existing ${noun} id`, message: `Unknown ${noun} "${id}"` };
}

export function findUnknownIds(field: string, ids: string[], existing: { id: string }[], noun: string): ValidationIssue[] {
  const known = new Set(existing.map((entry) => entry.id));
  return ids.filter((id) => !known.has(id)).map((id) => unknownIdIssue(`${field}.${id}`, id, noun));
}

// Existing entries are merged field-wise, new entries are appended as given (the schema rejects incomplete ones).
export function mergeByKey<T extends Record<string, unknown>>(entries: T[], patches: Partial<T>[], key: keyof T & string): T[] {
  const merged = [...entries];
  for (const patch of patches) {
    const index = merged.findIndex((entry) => entry[key] === patch[key]);
    if (index >= 0) merged[index] = { ...merged[index]!, ...patch };
    else merged.push(patch as T);
  }
  return merged;
}
