import { useEffect, useRef } from "react";
import { SHORTCUT_DEFINITIONS } from "../app/shortcuts.ts";
import { de } from "../i18n/de.ts";
import { useEditorStore } from "./editorStore.ts";
import { currentPlatform, formatCombo } from "./format.ts";

/** Modal list of all shortcuts: Escape closes, focus stays inside and returns to the opener. */
export function ShortcutDialog() {
  const isOpen = useEditorStore((state) => state.isShortcutDialogOpen);
  const setOpen = useEditorStore((state) => state.setShortcutDialogOpen);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
      // The close button is the only focusable element, so Tab simply stays on it.
      if (event.key === "Tab") event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      opener?.focus();
    };
  }, [isOpen, setOpen]);

  if (!isOpen) return null;
  const platform = currentPlatform();
  return (
    <div className="dialog-backdrop" onClick={() => setOpen(false)}>
      <div className="dialog panel" role="dialog" aria-modal="true" aria-labelledby="shortcut-dialog-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="shortcut-dialog-title" className="caps">{de.shortcutDialog.title}</h2>
        <ul className="shortcut-list">
          {SHORTCUT_DEFINITIONS.map((definition) => (
            <li key={definition.id}>
              <span>{definition.label}</span>
              <span className="shortcut-keys">
                {definition.keys.map((combo) => (
                  <kbd key={combo}>{formatCombo(combo, platform)}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <button ref={closeButton} className="button" type="button" onClick={() => setOpen(false)}>{de.shortcutDialog.close}</button>
      </div>
    </div>
  );
}
