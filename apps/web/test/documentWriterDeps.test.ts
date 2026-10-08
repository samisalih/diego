import { SEED_DOCUMENT } from "../../../packages/core/src/seed/index.ts";
import { describe, expect, it } from "vitest";
import { documentFromRow } from "../src/data/mappers.ts";
import { shouldApplyLocal } from "../src/data/documentWriterDeps.ts";
import { documentRow } from "./helpers/rows.ts";

// Contract: docs/specs/editor.md section 2.2, last sentence: applyLocal of the writer applies only when the store's document
// has the same id and a version not higher than the one being applied.
// Interpretation made by the tests (the implementation follows it):
// - shouldApplyLocal(storeDocument: PlannerDocument | null, incoming: PlannerDocument): boolean, exported from data/documentWriterDeps.ts
//   true when there is no store document, or same id and store version <= incoming version; false otherwise

const doc = (version: number, id = SEED_DOCUMENT.id) => documentFromRow(documentRow({ id, version }))!;

describe("shouldApplyLocal", () => {
  // Red if an empty store refuses the first document.
  it("applies when the store has no document", () => {
    expect(shouldApplyLocal(null, doc(1))).toBe(true);
  });

  // Red if a newer incoming version is refused.
  it("applies a higher version of the same document", () => {
    expect(shouldApplyLocal(doc(3), doc(4))).toBe(true);
  });

  // Red if the same version is refused: the optimistic apply of a commit carries the version of the store document.
  it("applies the same version of the same document", () => {
    expect(shouldApplyLocal(doc(3), doc(3))).toBe(true);
  });

  // Red if a late local apply overwrites newer state delivered by Realtime meanwhile.
  it("refuses a lower version than the store holds", () => {
    expect(shouldApplyLocal(doc(5), doc(4))).toBe(false);
  });

  // Red if a write for another document replaces the active one, whatever the versions are.
  it("refuses a different document id, even with a higher version", () => {
    expect(shouldApplyLocal(doc(1), doc(9, "doc_other"))).toBe(false);
    expect(shouldApplyLocal(doc(9), doc(1, "doc_other"))).toBe(false);
  });
});
