import { de } from "../i18n/de.ts";

export type Platform = "mac" | "other";

/** `keys` are alternative combos, e.g. "Mod+Shift+Z"; Mod is Cmd on mac and Ctrl elsewhere. */
export type Shortcut = { id: string; keys: string[]; label: string; run: () => void };

export type ShortcutDefinition = Omit<Shortcut, "run">;

/** The part of a KeyboardEvent the matching needs. */
export type ShortcutEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: { tagName: string; isContentEditable?: boolean } | null;
};

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: "rotatePlus90", keys: ["R"], label: de.shortcuts.rotatePlus90 },
  { id: "rotateMinus90", keys: ["Shift+R"], label: de.shortcuts.rotateMinus90 },
  { id: "duplicate", keys: ["Mod+D"], label: de.shortcuts.duplicate },
  { id: "delete", keys: ["Delete", "Backspace"], label: de.shortcuts.delete },
  { id: "toggleLock", keys: ["L"], label: de.shortcuts.toggleLock },
  { id: "toggleHidden", keys: ["H"], label: de.shortcuts.toggleHidden },
  { id: "undo", keys: ["Mod+Z"], label: de.shortcuts.undo },
  { id: "redo", keys: ["Mod+Shift+Z"], label: de.shortcuts.redo },
  { id: "clearSelection", keys: ["Escape"], label: de.shortcuts.clearSelection },
  { id: "showShortcuts", keys: ["?"], label: de.shortcuts.showShortcuts },
];

const RESERVED_WITH_MOD = new Set(["q", "w", "h", "m"]);
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Builds the registry from the default definitions; `runners` maps a shortcut id to its handler. */
export function createShortcutRegistry(runners: Record<string, () => void>): Shortcut[] {
  return SHORTCUT_DEFINITIONS.map((definition) => ({ ...definition, run: () => runners[definition.id]?.() }));
}

function isEditableTarget(target: ShortcutEvent["target"]): boolean {
  return target !== null && (EDITABLE_TAGS.has(target.tagName) || target.isContentEditable === true);
}

function matchesCombo(event: ShortcutEvent, combo: string, platform: Platform): boolean {
  const parts = combo.split("+");
  const key = parts.pop() ?? "";
  const wantsMod = parts.includes("Mod");
  const wantsShift = parts.includes("Shift");
  const hasMod = platform === "mac" ? event.metaKey : event.ctrlKey;
  const hasForeignMod = platform === "mac" ? event.ctrlKey : event.metaKey;
  if (hasForeignMod || event.altKey || hasMod !== wantsMod) return false;
  // "?" needs Shift on most layouts, so its Shift state is not compared.
  if (key !== "?" && event.shiftKey !== wantsShift) return false;
  return event.key.toLowerCase() === key.toLowerCase();
}

function isReserved(event: ShortcutEvent, platform: Platform): boolean {
  const hasMod = platform === "mac" ? event.metaKey : event.ctrlKey;
  return hasMod && RESERVED_WITH_MOD.has(event.key.toLowerCase());
}

/** The first shortcut whose combo matches the event; null while typing in a field or for reserved system keys. */
export function matchShortcut(event: ShortcutEvent, registry: Shortcut[], platform: Platform): Shortcut | null {
  if (isEditableTarget(event.target) || isReserved(event, platform)) return null;
  return registry.find((shortcut) => shortcut.keys.some((combo) => matchesCombo(event, combo, platform))) ?? null;
}
