import { duplicateItems, removeItems, setDocumentName, updateItems, type DocumentContent, type ItemPatch } from "@app/core";
import { commitOperation, redo, undo, type CommitResult, type ContentOperation, type DocumentWriterDeps, type Failure } from "../data/documentWriter.ts";
import { useSceneStore } from "../data/store.ts";
import { de } from "../i18n/de.ts";
import { useEditorStore } from "./editorStore.ts";

export type EditorCommands = {
  rotateSelected: (degrees: number) => Promise<void>;
  duplicateSelected: () => Promise<void>;
  removeSelected: () => Promise<void>;
  toggleLockSelected: () => Promise<void>;
  toggleHiddenSelected: () => Promise<void>;
  updateItem: (id: string, fields: Omit<ItemPatch, "id">) => Promise<CommitResult>;
  moveItems: (patches: ItemPatch[]) => Promise<CommitResult>;
  renameDocument: (name: string) => Promise<CommitResult>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

const LOCKED_ISSUE_PATTERN = /\blocked\b/i;

const FAILURE_MESSAGES: Record<Failure["reason"], string> = {
  conflict: de.toasts.conflict,
  network: de.toasts.network,
  notFound: de.toasts.notFound,
};

/** The German toast text of a rejected commit. */
export function rejectionMessage(result: Exclude<CommitResult, { ok: true }>): string {
  if (result.reason !== "invalid") return FAILURE_MESSAGES[result.reason];
  return result.issues.some((issue) => LOCKED_ISSUE_PATTERN.test(issue.message)) ? de.toasts.locked : de.toasts.invalid;
}

function selectedItemIds(): string[] {
  const existingIds = new Set((useSceneStore.getState().document?.items ?? []).map((item) => item.id));
  return useEditorStore.getState().selection.selectedIds.filter((id) => existingIds.has(id));
}

function itemIdsOf(): Set<string> {
  return new Set((useSceneStore.getState().document?.items ?? []).map((item) => item.id));
}

function itemsOf(content: DocumentContent, ids: string[]) {
  return content.items.filter((item) => ids.includes(item.id));
}

/** Commands of the editor; each one is exactly one commit (one revision) and reports rejections as a toast. */
export function createEditorCommands(deps: DocumentWriterDeps, options: { isHistoryEnabled: boolean }): EditorCommands {
  const { showToast, replaceSelection } = useEditorStore.getState();

  async function commit(operation: ContentOperation): Promise<CommitResult> {
    const result = await commitOperation(deps, operation);
    if (!result.ok) showToast(rejectionMessage(result));
    return result;
  }

  async function updateSelected(buildPatches: (content: DocumentContent, ids: string[]) => Omit<ItemPatch, "id">[]): Promise<void> {
    const ids = selectedItemIds();
    if (ids.length === 0) return;
    await commit((content, assets) => {
      const items = itemsOf(content, ids);
      const fields = buildPatches(content, ids);
      return updateItems(content, items.map((item, index) => ({ id: item.id, ...fields[index] })), assets);
    });
  }

  function toggledFlag(content: DocumentContent, ids: string[], flag: "locked" | "hidden"): boolean {
    return !itemsOf(content, ids).every((item) => item[flag]);
  }

  async function runHistory(run: typeof undo): Promise<void> {
    if (!options.isHistoryEnabled) return;
    const result = await run(deps);
    if (!result.ok) showToast(FAILURE_MESSAGES[result.reason]);
  }

  return {
    rotateSelected: (degrees) =>
      updateSelected((content, ids) => itemsOf(content, ids).map((item) => ({ rotation: item.rotation + degrees }))),
    toggleLockSelected: () =>
      updateSelected((content, ids) => {
        const locked = toggledFlag(content, ids, "locked");
        return itemsOf(content, ids).map(() => ({ locked }));
      }),
    toggleHiddenSelected: () =>
      updateSelected((content, ids) => {
        const hidden = toggledFlag(content, ids, "hidden");
        return itemsOf(content, ids).map(() => ({ hidden }));
      }),
    duplicateSelected: async () => {
      const ids = selectedItemIds();
      if (ids.length === 0) return;
      const idsBefore = itemIdsOf();
      const result = await commit((content) => duplicateItems(content, ids));
      if (!result.ok) return;
      const copyIds = (useSceneStore.getState().document?.items ?? []).map((item) => item.id).filter((id) => !idsBefore.has(id));
      replaceSelection({ selectedIds: copyIds, focusId: null });
    },
    removeSelected: async () => {
      const ids = selectedItemIds();
      if (ids.length === 0) return;
      const result = await commit((content) => removeItems(content, ids));
      if (result.ok) replaceSelection({ selectedIds: [], focusId: null });
    },
    updateItem: (id, fields) => commit((content, assets) => updateItems(content, [{ id, ...fields }], assets)),
    moveItems: (patches) => commit((content, assets) => updateItems(content, patches, assets)),
    renameDocument: (name) => commit((content) => setDocumentName(content, name)),
    undo: () => runHistory(undo),
    redo: () => runHistory(redo),
  };
}
