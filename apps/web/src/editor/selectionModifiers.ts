/** Shift, Cmd or Ctrl held on a click: toggle instead of replace. */
export function isToggleModifier(event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): boolean {
  return event.shiftKey || event.metaKey || event.ctrlKey;
}
