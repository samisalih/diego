import type { Platform } from "../app/shortcuts.ts";
import { de } from "../i18n/de.ts";

/** A number in German notation with at most `digits` decimals. */
export function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits: digits });
}

export function currentPlatform(): Platform {
  return /mac/i.test(navigator.platform) ? "mac" : "other";
}

const KEY_NAMES: Record<string, string> = { Delete: "Entf", Backspace: "⌫", Escape: "Esc" };

/** "Mod+Shift+Z" as shown to the user: "⌘⇧Z" on a Mac, "Strg+Umschalt+Z" elsewhere. */
export function formatCombo(combo: string, platform: Platform): string {
  const parts = combo.split("+").map((part) => {
    if (part === "Mod") return platform === "mac" ? de.shortcutDialog.modMac : de.shortcutDialog.mod;
    if (part === "Shift") return platform === "mac" ? "⇧" : "Umschalt";
    return KEY_NAMES[part] ?? part;
  });
  return platform === "mac" ? parts.join("") : parts.join("+");
}
