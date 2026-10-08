import { describe, expect, it } from "vitest";
import { NARROW_WINDOW_PX, insetsFor } from "../src/editor/layoutMetrics.ts";

// Contract: docs/specs/editor.md section 4 - panels float 12-16 px from the window edges, left ~280 px, right ~320 px, toolbar pill
// at the top; on windows narrower than 1100 px the panels can be collapsed to icon buttons. insetsFor gives the part of the window
// each side covers (gap + panel or button + gap); the camera frames the apartment in what is left.

const open = { isLeftOpen: true, isRightOpen: true };

describe("insetsFor", () => {
  // Red if the open panel widths or gaps drift from the spec (280 / 320 px plus 12-16 px gap on both sides).
  it("covers panel width plus gaps when both panels are open", () => {
    const insets = insetsFor(open);
    expect(insets.left).toBeGreaterThanOrEqual(280 + 2 * 12);
    expect(insets.left).toBeLessThanOrEqual(280 + 2 * 16);
    expect(insets.right).toBeGreaterThanOrEqual(320 + 2 * 12);
    expect(insets.right).toBeLessThanOrEqual(320 + 2 * 16);
  });

  // Red if collapsing does not shrink the covered side down to a button.
  it("covers much less on a collapsed side, but never nothing", () => {
    const collapsed = insetsFor({ isLeftOpen: false, isRightOpen: false });
    expect(collapsed.left).toBeGreaterThan(24);
    expect(collapsed.left).toBeLessThan(100);
    expect(collapsed.right).toBeGreaterThan(24);
    expect(collapsed.right).toBeLessThan(100);
  });

  // Red if one flag controls the wrong side or both.
  it("collapses each side independently", () => {
    const base = insetsFor(open);
    const leftOnly = insetsFor({ isLeftOpen: false, isRightOpen: true });
    const rightOnly = insetsFor({ isLeftOpen: true, isRightOpen: false });
    expect(leftOnly.left).toBeLessThan(base.left);
    expect(leftOnly.right).toBe(base.right);
    expect(rightOnly.right).toBeLessThan(base.right);
    expect(rightOnly.left).toBe(base.left);
  });

  // Red if the top reserve (toolbar pill) depends on the panels or is missing.
  it("reserves the same positive top space for the toolbar in every state", () => {
    const tops = [open, { isLeftOpen: false, isRightOpen: true }, { isLeftOpen: true, isRightOpen: false }, { isLeftOpen: false, isRightOpen: false }].map((state) => insetsFor(state).top);
    expect(tops[0]).toBeGreaterThan(0);
    expect(new Set(tops).size).toBe(1);
  });

  // Red if the narrow-window threshold differs from the spec (1100 px).
  it("collapses panels below a window width of 1100 px", () => {
    expect(NARROW_WINDOW_PX).toBe(1100);
  });
});
