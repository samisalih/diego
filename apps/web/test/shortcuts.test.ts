import { describe, expect, it, vi } from "vitest";
import { de } from "../src/i18n/de.ts";
import { SHORTCUT_DEFINITIONS, createShortcutRegistry, matchShortcut, type Shortcut } from "../src/app/shortcuts.ts";

// Contract: docs/specs/editor.md sections 3.3 and 3.4. Interpretations made by the tests (the implementation follows them):
// - Shortcut = { id: string; keys: string[]; label: string; run: () => void }; `keys` are alternative combos
// - combo syntax: optional modifiers "Mod+" (Cmd on mac, Ctrl elsewhere) and "Shift+", then a key name:
//   a single character (case-insensitive: "R", "D", "?") or a KeyboardEvent.key name ("Delete", "Backspace", "Escape")
// - modifiers must match exactly: "R" does not fire with Mod or Alt held, "Mod+D" not with the wrong modifier key of the
//   other platform; the character "?" ignores Shift (it needs Shift on most layouts)
// - matchShortcut(event, registry, platform) -> the first matching Shortcut or null; platform is "mac" | "other"
// - event = { key, metaKey, ctrlKey, shiftKey, altKey, target } (target: { tagName, isContentEditable } or null)
// - Mod+Q / Mod+W / Mod+H / Mod+M never match, whatever the registry contains
// - SHORTCUT_DEFINITIONS = the default list of { id, keys, label } (no handlers); label === de.shortcuts[id]
// - createShortcutRegistry(runners: Record<id, () => void>) -> Shortcut[] built from the definitions; run calls runners[id]

type EventOptions = { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean; target?: { tagName: string; isContentEditable?: boolean } | null };

function keyEvent(key: string, { meta = false, ctrl = false, shift = false, alt = false, target = { tagName: "BODY" } }: EventOptions = {}) {
  return { key, metaKey: meta, ctrlKey: ctrl, shiftKey: shift, altKey: alt, target };
}

const registryOf = (...definitions: Array<[string, string[]]>): Shortcut[] =>
  definitions.map(([id, keys]) => ({ id, keys, label: id, run: () => {} }));

const idOf = (shortcut: Shortcut | null) => shortcut?.id ?? null;

describe("matchShortcut", () => {
  const registry = registryOf(
    ["rotate", ["R"]],
    ["rotateBack", ["Shift+R"]],
    ["duplicate", ["Mod+D"]],
    ["remove", ["Delete", "Backspace"]],
    ["undo", ["Mod+Z"]],
    ["redo", ["Mod+Shift+Z"]],
    ["clear", ["Escape"]],
    ["help", ["?"]],
  );

  describe("modifier key per platform", () => {
    // Red if the platform is ignored: on mac Cmd is the modifier, Ctrl is not.
    it("uses Cmd on mac", () => {
      expect(idOf(matchShortcut(keyEvent("d", { meta: true }), registry, "mac"))).toBe("duplicate");
      expect(matchShortcut(keyEvent("d", { ctrl: true }), registry, "mac")).toBeNull();
    });

    // Red if Ctrl is not the modifier elsewhere, or if Cmd/Win also triggers.
    it("uses Ctrl on other platforms", () => {
      expect(idOf(matchShortcut(keyEvent("d", { ctrl: true }), registry, "other"))).toBe("duplicate");
      expect(matchShortcut(keyEvent("d", { meta: true }), registry, "other")).toBeNull();
    });

    // Red if a plain-letter shortcut fires together with the modifier (Cmd+R would hijack the browser reload).
    it("does not fire a plain key shortcut while the modifier is held", () => {
      expect(matchShortcut(keyEvent("r", { meta: true }), registry, "mac")).toBeNull();
      expect(matchShortcut(keyEvent("r", { ctrl: true }), registry, "other")).toBeNull();
    });

    // Red if Alt combinations fire (they are used by the OS and by input methods).
    it("does not fire with Alt held", () => {
      expect(matchShortcut(keyEvent("r", { alt: true }), registry, "mac")).toBeNull();
      expect(matchShortcut(keyEvent("d", { meta: true, alt: true }), registry, "mac")).toBeNull();
    });
  });

  describe("keys and Shift variants", () => {
    // Red if the key comparison is case-sensitive: browsers report "r" for R and "R" with Shift or Caps Lock.
    it("matches letters case-insensitively", () => {
      expect(idOf(matchShortcut(keyEvent("r"), registry, "mac"))).toBe("rotate");
      expect(idOf(matchShortcut(keyEvent("R"), registry, "mac"))).toBe("rotate");
    });

    // Red if Shift+R and R are not distinguished (both would rotate the same way).
    it("tells R and Shift+R apart", () => {
      expect(idOf(matchShortcut(keyEvent("R", { shift: true }), registry, "mac"))).toBe("rotateBack");
      expect(idOf(matchShortcut(keyEvent("r", { shift: true }), registry, "mac"))).toBe("rotateBack");
      expect(idOf(matchShortcut(keyEvent("r"), registry, "mac"))).toBe("rotate");
    });

    // Red if Undo and Redo collide (Mod+Shift+Z must be redo, Mod+Z undo).
    it("tells Mod+Z and Mod+Shift+Z apart", () => {
      expect(idOf(matchShortcut(keyEvent("z", { meta: true }), registry, "mac"))).toBe("undo");
      expect(idOf(matchShortcut(keyEvent("Z", { meta: true, shift: true }), registry, "mac"))).toBe("redo");
      expect(idOf(matchShortcut(keyEvent("z", { ctrl: true, shift: true }), registry, "other"))).toBe("redo");
    });

    // Red if only the first key alternative is honoured.
    it("matches every alternative of a shortcut", () => {
      expect(idOf(matchShortcut(keyEvent("Delete"), registry, "mac"))).toBe("remove");
      expect(idOf(matchShortcut(keyEvent("Backspace"), registry, "mac"))).toBe("remove");
      expect(idOf(matchShortcut(keyEvent("Escape"), registry, "mac"))).toBe("clear");
    });

    // Red if "?" requires a particular Shift state (layout dependent).
    it("matches ? with and without Shift", () => {
      expect(idOf(matchShortcut(keyEvent("?", { shift: true }), registry, "mac"))).toBe("help");
      expect(idOf(matchShortcut(keyEvent("?"), registry, "other"))).toBe("help");
    });

    // Red if an unbound key returns a shortcut.
    it("returns null for an unbound key", () => {
      expect(matchShortcut(keyEvent("x"), registry, "mac")).toBeNull();
      expect(matchShortcut(keyEvent("Enter"), registry, "mac")).toBeNull();
    });
  });

  describe("focus in editable elements", () => {
    // Red if typing in a field triggers shortcuts (R in the name field would rotate the item).
    it.each([
      ["input", { tagName: "INPUT" }],
      ["textarea", { tagName: "TEXTAREA" }],
      ["select", { tagName: "SELECT" }],
      ["contenteditable", { tagName: "DIV", isContentEditable: true }],
    ])("ignores shortcuts while focus is in a %s", (_name, target) => {
      expect(matchShortcut(keyEvent("r", { target }), registry, "mac")).toBeNull();
      expect(matchShortcut(keyEvent("z", { meta: true, target }), registry, "mac")).toBeNull();
      expect(matchShortcut(keyEvent("Escape", { target }), registry, "mac")).toBeNull();
      expect(matchShortcut(keyEvent("Backspace", { target }), registry, "mac")).toBeNull();
    });

    // Red if non-editable focus targets (buttons, the canvas, no target) are ignored too.
    it("still matches when focus is on a button, the canvas or nothing", () => {
      expect(idOf(matchShortcut(keyEvent("r", { target: { tagName: "BUTTON" } }), registry, "mac"))).toBe("rotate");
      expect(idOf(matchShortcut(keyEvent("r", { target: { tagName: "CANVAS", isContentEditable: false } }), registry, "mac"))).toBe("rotate");
      expect(idOf(matchShortcut(keyEvent("r", { target: null }), registry, "mac"))).toBe("rotate");
    });
  });

  describe("reserved system shortcuts", () => {
    const reserved = registryOf(["quit", ["Mod+Q"]], ["close", ["Mod+W"]], ["hide", ["Mod+H"]], ["minimise", ["Mod+M"]], ["plainHide", ["H"]]);

    // Red if a registry may bind Cmd+Q/W/H/M (the browser/OS must keep them).
    it.each(["q", "w", "h", "m"])("never matches Mod+%s", (key) => {
      expect(matchShortcut(keyEvent(key, { meta: true }), reserved, "mac")).toBeNull();
      expect(matchShortcut(keyEvent(key, { ctrl: true }), reserved, "other")).toBeNull();
    });

    // Red if the reserved-key guard also swallows the plain H shortcut (hide/show).
    it("keeps the plain H shortcut working", () => {
      expect(idOf(matchShortcut(keyEvent("h"), reserved, "mac"))).toBe("plainHide");
    });
  });

  // Red if the registry order is not respected for the first match.
  it("returns the first matching shortcut", () => {
    const duplicates = registryOf(["first", ["R"]], ["second", ["R"]]);
    expect(idOf(matchShortcut(keyEvent("r"), duplicates, "mac"))).toBe("first");
  });
});

describe("default registry", () => {
  // Spec section 3.3 table: id -> default combos.
  const expected: Record<string, string[]> = {
    rotatePlus90: ["R"],
    rotateMinus90: ["Shift+R"],
    duplicate: ["Mod+D"],
    delete: ["Delete", "Backspace"],
    toggleLock: ["L"],
    toggleHidden: ["H"],
    undo: ["Mod+Z"],
    redo: ["Mod+Shift+Z"],
    clearSelection: ["Escape"],
    showShortcuts: ["?"],
  };

  // Red if a command from the table is missing or has a different default key.
  it("contains every shortcut of the command table with its default keys", () => {
    const keysById = Object.fromEntries(SHORTCUT_DEFINITIONS.map((definition) => [definition.id, [...definition.keys].sort()]));
    for (const [id, keys] of Object.entries(expected)) expect(keysById[id], id).toEqual([...keys].sort());
    expect(SHORTCUT_DEFINITIONS).toHaveLength(Object.keys(expected).length);
  });

  // Red if a label is missing, not unique, or not taken from de.ts (de.shortcuts.<id>).
  it("has a unique German label from de.ts for every shortcut", () => {
    const labels = SHORTCUT_DEFINITIONS.map((definition) => definition.label);
    for (const definition of SHORTCUT_DEFINITIONS) {
      expect(definition.label.length, definition.id).toBeGreaterThan(0);
      expect((de as unknown as { shortcuts: Record<string, string> }).shortcuts[definition.id], definition.id).toBe(definition.label);
    }
    expect(new Set(labels).size).toBe(labels.length);
  });

  // Red if a default shortcut uses a reserved system combination.
  it("binds none of the reserved combinations Mod+Q, Mod+W, Mod+H, Mod+M", () => {
    const combos = SHORTCUT_DEFINITIONS.flatMap((definition) => definition.keys.map((key) => key.toLowerCase()));
    for (const reserved of ["mod+q", "mod+w", "mod+h", "mod+m"]) expect(combos).not.toContain(reserved);
  });

  // Red if the runners are not wired to the matching shortcut (e.g. swapped ids).
  it("creates a registry whose run calls the runner of the matched shortcut", () => {
    const runners = Object.fromEntries(Object.keys(expected).map((id) => [id, vi.fn()]));
    const registry = createShortcutRegistry(runners);
    expect(registry.map((shortcut) => shortcut.id).sort()).toEqual(Object.keys(expected).sort());
    const redo = matchShortcut(keyEvent("z", { meta: true, shift: true }), registry, "mac")!;
    redo.run();
    expect(runners.redo).toHaveBeenCalledTimes(1);
    const rotate = matchShortcut(keyEvent("r"), registry, "mac")!;
    rotate.run();
    expect(runners.rotatePlus90).toHaveBeenCalledTimes(1);
    expect(runners.rotateMinus90).not.toHaveBeenCalled();
    expect(runners.undo).not.toHaveBeenCalled();
  });
});
