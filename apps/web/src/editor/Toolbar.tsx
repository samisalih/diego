import { useEffect, useState, type ReactNode } from "react";
import { SHORTCUT_DEFINITIONS } from "../app/shortcuts.ts";
import { useSceneStore } from "../data/store.ts";
import { de } from "../i18n/de.ts";
import { useEditorCommands } from "./EditorContext.tsx";
import { useEditorStore } from "./editorStore.ts";
import { currentPlatform, formatCombo } from "./format.ts";
import { DuplicateIcon, EyeIcon, EyeOffIcon, HelpIcon, LockIcon, RedoIcon, TrashIcon, UndoIcon, UnlockIcon } from "./icons.tsx";
import type { HistoryState } from "./useHistoryState.ts";

const CLOCK_TICK_MS = 1000;

function shortcutHint(id: string): string {
  const keys = SHORTCUT_DEFINITIONS.find((definition) => definition.id === id)?.keys[0];
  return keys ? ` (${formatCombo(keys, currentPlatform())})` : "";
}

function ToolButton({ label, shortcutId, disabled, onClick, children }: { label: string; shortcutId: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={`${label}${shortcutHint(shortcutId)}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** Re-renders every second while `busyUntil` lies in the future, so the chip disappears on its own; idle otherwise. */
function useNowMs(busyUntil: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (busyUntil === null) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.parse(busyUntil) <= Date.now()) clearInterval(timer);
    }, CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [busyUntil]);
  return now;
}

export function ClaudeBusyChip() {
  const busyUntil = useSceneStore((state) => state.appState?.aiBusyUntil ?? null);
  const now = useNowMs(busyUntil);
  if (busyUntil === null || Date.parse(busyUntil) <= now) return null;
  return (
    <span className="chip led" role="status">
      <span className="chip-dot" aria-hidden="true" />
      {de.toolbar.claudeBusy}
    </span>
  );
}

/** The toolbar row between the top bar and the viewport. */
export function Toolbar({ history }: { history: HistoryState }) {
  const commands = useEditorCommands();
  const items = useSceneStore((state) => state.document?.items);
  const selectedIds = useEditorStore((state) => state.selection.selectedIds);
  const setShortcutDialogOpen = useEditorStore((state) => state.setShortcutDialogOpen);
  const selectedItems = (items ?? []).filter((item) => selectedIds.includes(item.id));
  const hasSelection = selectedItems.length > 0;
  const allLocked = hasSelection && selectedItems.every((item) => item.locked);
  const allHidden = hasSelection && selectedItems.every((item) => item.hidden);

  return (
    <div className="toolbar" role="toolbar" aria-label={de.toolbar.label}>
      <div className="toolbar-group">
        <ToolButton label={de.toolbar.undo} shortcutId="undo" disabled={!history.canUndo} onClick={() => void commands.undo()}><UndoIcon /></ToolButton>
        <ToolButton label={de.toolbar.redo} shortcutId="redo" disabled={!history.canRedo} onClick={() => void commands.redo()}><RedoIcon /></ToolButton>
      </div>
      <div className="toolbar-group">
        <ToolButton label={de.toolbar.duplicate} shortcutId="duplicate" disabled={!hasSelection} onClick={() => void commands.duplicateSelected()}><DuplicateIcon /></ToolButton>
        <ToolButton label={de.toolbar.delete} shortcutId="delete" disabled={!hasSelection} onClick={() => void commands.removeSelected()}><TrashIcon /></ToolButton>
        <ToolButton label={allLocked ? de.toolbar.unlock : de.toolbar.lock} shortcutId="toggleLock" disabled={!hasSelection} onClick={() => void commands.toggleLockSelected()}>
          {allLocked ? <UnlockIcon /> : <LockIcon />}
        </ToolButton>
        <ToolButton label={allHidden ? de.toolbar.show : de.toolbar.hide} shortcutId="toggleHidden" disabled={!hasSelection} onClick={() => void commands.toggleHiddenSelected()}>
          {allHidden ? <EyeIcon /> : <EyeOffIcon />}
        </ToolButton>
      </div>
      <div className="toolbar-group">
        <ToolButton label={de.toolbar.shortcuts} shortcutId="showShortcuts" disabled={false} onClick={() => setShortcutDialogOpen(true)}><HelpIcon /></ToolButton>
      </div>
    </div>
  );
}
