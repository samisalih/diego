/** Geometry of the floating chrome. The CSS reads these through custom properties set on the shell, so there is one source. */
export const PANEL_GAP_PX = 12;
export const LEFT_PANEL_WIDTH_PX = 280;
export const RIGHT_PANEL_WIDTH_PX = 320;
/** Space the toolbar pill takes at the top. */
export const TOP_RESERVE_PX = 60;
/** A collapsed panel is a single round button. */
export const COLLAPSED_BUTTON_PX = 40;
/** Below this window width the panels can be collapsed (and start collapsed). */
export const NARROW_WINDOW_PX = 1100;

export type Insets = { left: number; right: number; top: number };

type PanelOpenState = { isLeftOpen: boolean; isRightOpen: boolean };

/** The part of the window the panels cover on each side; the camera frames the apartment in what is left. */
export function insetsFor({ isLeftOpen, isRightOpen }: PanelOpenState): Insets {
  return {
    left: PANEL_GAP_PX + (isLeftOpen ? LEFT_PANEL_WIDTH_PX : COLLAPSED_BUTTON_PX) + PANEL_GAP_PX,
    right: PANEL_GAP_PX + (isRightOpen ? RIGHT_PANEL_WIDTH_PX : COLLAPSED_BUTTON_PX) + PANEL_GAP_PX,
    top: TOP_RESERVE_PX,
  };
}
