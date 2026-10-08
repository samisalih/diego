import { useRef, useState } from "react";
import { useSceneStore } from "../data/store.ts";
import { de } from "../i18n/de.ts";
import { useEditorCommands } from "./EditorContext.tsx";
import { Inspector } from "./Inspector.tsx";
import { ToastHost } from "./ToastHost.tsx";
import { Tree } from "./Tree.tsx";

/** The document name; double-click renames it (commit on blur / Enter, Escape cancels). */
function DocumentName() {
  const name = useSceneStore((state) => state.document?.name ?? "");
  const commands = useEditorCommands();
  const [isEditing, setIsEditing] = useState(false);
  const isFinishing = useRef(false);

  if (!isEditing) {
    return (
      <h2 className="document-name" title={de.panel.renameDocument} onDoubleClick={() => {
          isFinishing.current = false;
          setIsEditing(true);
        }}>
        {name}
      </h2>
    );
  }
  const finish = (nextName: string | null): void => {
    // Unmounting the input can blur it again; the first call wins.
    if (isFinishing.current) return;
    isFinishing.current = true;
    setIsEditing(false);
    if (nextName !== null && nextName !== name) void commands.renameDocument(nextName);
  };
  return (
    <input
      className="input document-name-input"
      aria-label={de.panel.renameDocument}
      defaultValue={name}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(event.currentTarget.value);
        if (event.key === "Escape") finish(null);
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
}

export function SidePanel() {
  return (
    <aside className="side-panel" aria-label={de.panel.label}>
      <header className="side-panel-header">
        <DocumentName />
      </header>
      <div className="side-panel-tree">
        <Tree />
      </div>
      <div className="side-panel-inspector">
        <Inspector />
      </div>
      <ToastHost />
    </aside>
  );
}
