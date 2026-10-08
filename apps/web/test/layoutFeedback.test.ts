import type { LayoutIssue } from "@app/core";
import { describe, expect, it } from "vitest";
import { formatIssue, issuesBySubject } from "../src/editor/layoutFeedback.ts";

// Contract: docs/specs/editor.md sections 5.1 and 5.2. Interpretations made by the tests (the implementation follows them):
// - issuesBySubject(issues: LayoutIssue[]) -> Map<string, LayoutIssue[]>; keyed by subjectId and (when not null) objectId,
//   per key in the input order; an issue whose subject equals its object is listed once
// - formatIssue(issue: LayoutIssue, namesById: ReadonlyMap<string, string>, forId?: string) -> string | null
//   - namesById maps an entity id to the name shown to the user: item -> item name ?? asset name,
//     opening -> its German type name ("Tür" | "Fenster" | "Balkontür")
//   - forId is the entity the text is written for (default: issue.subjectId); a collision reads "Kollidiert mit <the other side>";
//     the other side is "Wand" when its id starts with "wall_", else namesById.get(id)
//   - adjustedParam returns null (it is shown as the mustard dot, not as text)
//   - clampedParam lists the keys of issue.detail (comma separated) joined by ", "
//   - narrowPassage rounds issue.value (metres) to whole centimetres

function issue(kind: LayoutIssue["kind"], subjectId: string, fields: Partial<LayoutIssue> = {}): LayoutIssue {
  return { kind, subjectId, objectId: null, value: null, detail: null, ...fields };
}

describe("issuesBySubject", () => {
  // Red if the object of an issue is not indexed (the second item of a collision would show no marker).
  it("lists an issue under both its subject and its object", () => {
    const collision = issue("collision", "item_a", { objectId: "item_b" });
    const map = issuesBySubject([collision]);
    expect(map.get("item_a")).toEqual([collision]);
    expect(map.get("item_b")).toEqual([collision]);
    expect(map.size).toBe(2);
  });

  // Red if a null objectId creates a "null" entry.
  it("indexes an issue without object only under its subject", () => {
    const outside = issue("outsideRoom", "item_a");
    const map = issuesBySubject([outside]);
    expect([...map.keys()]).toEqual(["item_a"]);
  });

  // Red if issues of one id overwrite each other instead of accumulating in input order.
  it("collects several issues per id in input order", () => {
    const first = issue("collision", "item_a", { objectId: "wall_north" });
    const second = issue("narrowPassage", "item_a", { objectId: "item_b", value: 0.5 });
    const third = issue("collision", "item_c", { objectId: "item_a" });
    const map = issuesBySubject([first, second, third]);
    expect(map.get("item_a")).toEqual([first, second, third]);
    expect(map.get("item_b")).toEqual([second]);
    expect(map.get("wall_north")).toEqual([first]);
  });

  // Red if a blocked opening is only found from the opening side (subject is the opening, the object the item).
  it("finds a blocked opening from the blocking item", () => {
    const blocked = issue("blockedOpening", "opening_front_door", { objectId: "item_a" });
    expect(issuesBySubject([blocked]).get("item_a")).toEqual([blocked]);
  });

  // Red if a self-referencing issue is listed twice.
  it("lists an issue once when subject and object are the same id", () => {
    const odd = issue("collision", "item_a", { objectId: "item_a" });
    expect(issuesBySubject([odd]).get("item_a")).toEqual([odd]);
  });

  // Red if the empty input yields entries.
  it("returns an empty map for no issues", () => {
    expect(issuesBySubject([]).size).toBe(0);
  });
});

describe("formatIssue", () => {
  const names = new Map([
    ["item_a", "Sofa"],
    ["item_b", "Stehlampe"],
    ["opening_front_door", "Tür"],
    ["opening_window", "Fenster"],
    ["opening_balcony", "Balkontür"],
  ]);

  describe("collision", () => {
    // Red if the other item's name is not used.
    it("names the other item", () => {
      expect(formatIssue(issue("collision", "item_a", { objectId: "item_b" }), names)).toBe("Kollidiert mit Stehlampe");
    });

    // Red if a wall is named by its id instead of "Wand".
    it("says Wand for a wall", () => {
      expect(formatIssue(issue("collision", "item_a", { objectId: "wall_north" }), names)).toBe("Kollidiert mit Wand");
    });

    // Red if the object's own text names itself (the inspector of item_b would read "Kollidiert mit Stehlampe").
    it("names the other side when written for the object", () => {
      expect(formatIssue(issue("collision", "item_a", { objectId: "item_b" }), names, "item_b")).toBe("Kollidiert mit Sofa");
    });
  });

  describe("narrowPassage", () => {
    // Red if the value is shown in metres or not rounded.
    it.each([
      [0.5, "Durchgang zu schmal: 50 cm"],
      [0.456, "Durchgang zu schmal: 46 cm"],
      [0.4549, "Durchgang zu schmal: 45 cm"],
      [0.3, "Durchgang zu schmal: 30 cm"],
    ])("renders %s m as whole centimetres", (value, text) => {
      expect(formatIssue(issue("narrowPassage", "item_a", { objectId: "item_b", value }), names)).toBe(text);
    });
  });

  describe("blockedOpening", () => {
    // Red if the opening type is not taken from the name of the opening (Tür | Fenster | Balkontür).
    it.each([
      ["opening_front_door", "Blockiert Tür"],
      ["opening_window", "Blockiert Fenster"],
      ["opening_balcony", "Blockiert Balkontür"],
    ])("renders %s", (openingId, text) => {
      expect(formatIssue(issue("blockedOpening", openingId, { objectId: "item_a" }), names, "item_a")).toBe(text);
    });
  });

  describe("other kinds", () => {
    it("renders outsideRoom", () => {
      expect(formatIssue(issue("outsideRoom", "item_a"), names)).toBe("Steht außerhalb eines Raums");
    });

    it("renders unknownAsset", () => {
      expect(formatIssue(issue("unknownAsset", "item_a"), names)).toBe("Möbelvorlage fehlt");
    });

    // Red if the keys are dropped or not separated.
    it("lists the clamped parameter keys", () => {
      expect(formatIssue(issue("clampedParam", "item_a", { detail: "width" }), names)).toBe("Regler angepasst: width");
      expect(formatIssue(issue("clampedParam", "item_a", { detail: "width,depth" }), names)).toBe("Regler angepasst: width, depth");
    });

    // Red if adjusted params produce a text (they are only the mustard dot).
    it("returns null for adjustedParam", () => {
      expect(formatIssue(issue("adjustedParam", "item_a", { detail: "width" }), names)).toBeNull();
    });
  });
});
