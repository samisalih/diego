import type { Platform } from "../app/shortcuts.ts";
import { de } from "../i18n/de.ts";

/** A number in German notation with at most `digits` decimals. */
export function formatNumber(value: number, digits = 1): string {
  const text = value.toLocaleString("de-DE", { maximumFractionDigits: digits });
  // A tiny negative value rounds to "-0".
  return text === "-0" ? "0" : text;
}

export function currentPlatform(): Platform {
  return /mac/i.test(navigator.platform) ? "mac" : "other";
}

const KEY_NAMES: Record<string, string> = { Delete: de.keyNames.delete, Backspace: de.keyNames.backspace, Escape: de.keyNames.escape };

/** "Mod+Shift+Z" as shown to the user: "⌘⇧Z" on a Mac, "Strg+Umschalt+Z" elsewhere. */
export function formatCombo(combo: string, platform: Platform): string {
  const parts = combo.split("+").map((part) => {
    if (part === "Mod") return platform === "mac" ? de.shortcutDialog.modMac : de.shortcutDialog.mod;
    if (part === "Shift") return platform === "mac" ? de.keyNames.shiftMac : de.keyNames.shiftOther;
    return KEY_NAMES[part] ?? part;
  });
  return platform === "mac" ? parts.join("") : parts.join("+");
}
