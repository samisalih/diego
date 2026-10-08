import { useEffect } from "react";
import { createShortcutRegistry, matchShortcut } from "../app/shortcuts.ts";
import type { EditorCommands } from "./commands.ts";
import { useEditorStore } from "./editorStore.ts";
import { currentPlatform } from "./format.ts";

const ROTATION_STEP_DEGREES = 90;

/** One keydown listener on the window; the shortcut definitions and matching live in app/shortcuts.ts. */
export function useShortcuts(commands: EditorCommands): void {
  useEffect(() => {
    const platform = currentPlatform();
    const editor = useEditorStore.getState();
    const registry = createShortcutRegistry({
      rotatePlus90: () => void commands.rotateSelected(ROTATION_STEP_DEGREES),
      rotateMinus90: () => void commands.rotateSelected(-ROTATION_STEP_DEGREES),
      duplicate: () => void commands.duplicateSelected(),
      delete: () => void commands.removeSelected(),
      toggleLock: () => void commands.toggleLockSelected(),
      toggleHidden: () => void commands.toggleHiddenSelected(),
      undo: () => void commands.undo(),
      redo: () => void commands.redo(),
      clearSelection: () => editor.dispatchSelection({ type: "clear" }),
      showShortcuts: () => editor.setShortcutDialogOpen(true),
    });
    const handleKeyDown = (event: KeyboardEvent): void => {
      // Holding a key must not repeat a write (one revision per press).
      if (event.repeat) return;
      const shortcut = matchShortcut(
        { key: event.key, metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, target: event.target as HTMLElement | null },
        registry,
        platform,
      );
      if (!shortcut) return;
      event.preventDefault();
      shortcut.run();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commands]);
}
