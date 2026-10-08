import { describe, expect, it } from "vitest";
import { formatCombo, formatNumber } from "../src/editor/format.ts";

// Contract: docs/specs/editor.md sections 4.2 (area with 1 decimal, German UI) and 3.4 (shortcut overview).
// Interpretations made by the tests:
// - formatNumber(value, digits = 1) -> German notation (decimal comma, thousands dot), at most `digits` decimals, no trailing zeros
// - formatCombo("Mod+Shift+Z", platform) -> mac "⌘⇧Z" (joined without separator), other "Strg+Umschalt+Z";
//   Delete -> "Entf", Backspace -> "⌫", Escape -> "Esc"; other keys unchanged

describe("formatNumber", () => {
  // Red if the decimal separator is a point (en-US notation).
  it("uses the decimal comma", () => {
    expect(formatNumber(12.5)).toBe("12,5");
  });

  // Red if the default is not 1 decimal (room areas are shown with 1 decimal).
  it("rounds to one decimal by default", () => {
    expect(formatNumber(23.449)).toBe("23,4");
    expect(formatNumber(23.46)).toBe("23,5");
  });

  // Red if the digits argument is ignored.
  it("honours the digits argument", () => {
    expect(formatNumber(1.2345, 2)).toBe("1,23");
    expect(formatNumber(1.6, 0)).toBe("2");
  });

  // Red if trailing zeros are padded (minimumFractionDigits set).
  it("drops trailing zeros", () => {
    expect(formatNumber(2)).toBe("2");
    expect(formatNumber(2.04)).toBe("2");
  });

  // Red if the thousands separator is missing or not a point.
  it("groups thousands with a point", () => {
    expect(formatNumber(1234.5)).toBe("1.234,5");
  });

  it("keeps the sign of negative numbers", () => {
    expect(formatNumber(-1.5)).toBe("-1,5");
  });

  // Red if a value that rounds to zero keeps its minus sign ("-0" is never meant to be shown).
  it("never shows a negative zero", () => {
    expect(formatNumber(-0.04)).toBe("0");
    expect(formatNumber(-0)).toBe("0");
  });

  it("formats zero", () => {
    expect(formatNumber(0)).toBe("0");
  });
});

describe("formatCombo", () => {
  // Red if the mac glyphs are not used or are separated.
  it("renders Mod+Shift+Z as symbols on a Mac", () => {
    expect(formatCombo("Mod+Shift+Z", "mac")).toBe("⌘⇧Z");
  });

  // Red if the German key names are not used or the separator is missing.
  it("renders Mod+Shift+Z with German key names elsewhere", () => {
    expect(formatCombo("Mod+Shift+Z", "other")).toBe("Strg+Umschalt+Z");
  });

  // Red if Mod is mapped to the same text on both platforms.
  it("maps Mod to Cmd on a Mac and Strg elsewhere", () => {
    expect(formatCombo("Mod+D", "mac")).toBe("⌘D");
    expect(formatCombo("Mod+D", "other")).toBe("Strg+D");
  });

  // Red if Shift is not translated.
  it("maps Shift on its own", () => {
    expect(formatCombo("Shift+R", "mac")).toBe("⇧R");
    expect(formatCombo("Shift+R", "other")).toBe("Umschalt+R");
  });

  // Red if a special key is not named: Delete -> Entf, Backspace -> ⌫, Escape -> Esc, on both platforms.
  it.each([["Delete", "Entf"], ["Backspace", "⌫"], ["Escape", "Esc"]])("names the key %s as %s", (key, shown) => {
    expect(formatCombo(key, "mac")).toBe(shown);
    expect(formatCombo(key, "other")).toBe(shown);
  });

  // Red if a plain key is altered or a separator is added.
  it("leaves a single plain key unchanged", () => {
    expect(formatCombo("R", "mac")).toBe("R");
    expect(formatCombo("?", "other")).toBe("?");
  });
});
