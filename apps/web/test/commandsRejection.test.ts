import type { ValidationIssue } from "@app/core";
import { describe, expect, it } from "vitest";
import { rejectionMessage } from "../src/editor/commands.ts";
import { de } from "../src/i18n/de.ts";

// Contract: docs/specs/editor.md section 3 (each rejected commit is reported as a German toast).
// Interpretations made by the tests:
// - failures conflict / network / notFound map to the toast of the same name
// - an "invalid" result maps to the "locked" toast when core rejected the change because an item is locked
//   (core message: `Item "<id>" is locked; set locked to false to change <field>`), else to the generic "invalid" toast

const issue = (message: string): ValidationIssue => ({ field: "x", value: 1, allowed: "unchanged while the item is locked", message });

describe("rejectionMessage", () => {
  // Red if a failure reason is mapped to the wrong toast.
  it.each([
    ["conflict", de.toasts.conflict],
    ["network", de.toasts.network],
    ["notFound", de.toasts.notFound],
  ] as const)("maps the failure %s to its toast", (reason, expected) => {
    expect(rejectionMessage({ ok: false, reason, message: "boom" })).toBe(expected);
  });

  // Red if the technical failure message leaks into the toast.
  it("does not show the technical message of a failure", () => {
    expect(rejectionMessage({ ok: false, reason: "network", message: "ECONNRESET" })).not.toContain("ECONNRESET");
  });

  // Red if the locked case of core is not recognised.
  it("shows the locked toast for the core locked rejection", () => {
    const result = rejectionMessage({ ok: false, reason: "invalid", issues: [issue('Item "item_sofa" is locked; set locked to false to change x')] });
    expect(result).toBe(de.toasts.locked);
  });

  // Red if only the first issue is inspected.
  it("shows the locked toast when any issue is a locked rejection", () => {
    const result = rejectionMessage({
      ok: false,
      reason: "invalid",
      issues: [issue("Rotation must be a number"), issue('Item "item_sofa" is locked; set locked to false to change z')],
    });
    expect(result).toBe(de.toasts.locked);
  });

  // Red if every invalid result becomes the locked toast.
  it("shows the generic toast for other invalid results", () => {
    expect(rejectionMessage({ ok: false, reason: "invalid", issues: [issue("Position x must be a finite number")] })).toBe(de.toasts.invalid);
  });

  // Red if no issues at all crash or are taken for locked.
  it("shows the generic toast without issues", () => {
    expect(rejectionMessage({ ok: false, reason: "invalid", issues: [] })).toBe(de.toasts.invalid);
  });

  // Red if the locked detection is a loose substring match: "blocked" contains "locked" but is no lock rejection.
  it("does not mistake a blocked message for a locked one", () => {
    expect(rejectionMessage({ ok: false, reason: "invalid", issues: [issue('Opening "opening_front_door" is blocked by item_sofa')] })).toBe(de.toasts.invalid);
  });
});
