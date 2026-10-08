import { useEffect, useMemo, type ReactNode } from "react";
import { signOut } from "../auth/signIn.ts";
import { createLocalOnlyDocumentWriterDeps, createSupabaseDocumentWriterDeps } from "../data/documentWriterDeps.ts";
import { useSceneStore } from "../data/store.ts";
import { getSupabase } from "../data/supabaseClient.ts";
import { installEditorDevHooks } from "../dev/editorDevHooks.ts";
import { setEditorCommands } from "../editor/commandsRegistry.ts";
import { createEditorCommands } from "../editor/commands.ts";
import { EditorCommandsContext } from "../editor/EditorContext.tsx";
import { ShortcutDialog } from "../editor/ShortcutDialog.tsx";
import { SidePanel } from "../editor/SidePanel.tsx";
import { Toolbar } from "../editor/Toolbar.tsx";
import { useHistoryState } from "../editor/useHistoryState.ts";
import { usePruneSelection, useSelectionSync } from "../editor/useSelectionSync.ts";
import { useShortcuts } from "../editor/useShortcuts.ts";
import { de } from "../i18n/de.ts";
import { BrandMark } from "./BrandMark.tsx";
import { Viewport } from "../scene/Viewport.tsx";

function ViewportMessage({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="viewport-message">
      <h2 className="display">{title}</h2>
      {hint && <p className="muted">{hint}</p>}
      {children}
    </div>
  );
}

function SceneOrMessage({ onRetry }: { onRetry?: () => void }) {
  const document = useSceneStore((state) => state.document);
  const status = useSceneStore((state) => state.status);
  const error = useSceneStore((state) => state.error);
  if (document) return <Viewport />;
  if (status === "error") {
    return (
      <ViewportMessage title={error ?? de.data.loadFailed}>
        {onRetry && <button className="button" type="button" onClick={onRetry}>{de.data.retry}</button>}
      </ViewportMessage>
    );
  }
  if (status === "ready") return <ViewportMessage title={de.data.noDocument} hint={de.data.noDocumentHint} />;
  return <ViewportMessage title={de.app.loading} />;
}

/** Load error above the viewport (never over the canvas) while a cached scene is still shown. */
function ErrorStrip({ onRetry }: { onRetry?: () => void }) {
  const hasDocument = useSceneStore((state) => state.document !== null);
  const status = useSceneStore((state) => state.status);
  const error = useSceneStore((state) => state.error);
  if (!hasDocument || status !== "error") return null;
  return (
    <div className="error-strip" role="alert">
      <span>{error ?? de.data.loadFailed}</span>
      {onRetry && <button className="button" type="button" onClick={onRetry}>{de.data.retry}</button>}
    </div>
  );
}

/** Dev only: fixture mode can preselect, preview a drag and run a simulated drag via URL parameters. */
function useDevHooks(isFixture: boolean): void {
  const hasDocument = useSceneStore((state) => state.document !== null);
  useEffect(() => {
    if (!import.meta.env.DEV || !isFixture || !hasDocument) return;
    return installEditorDevHooks();
  }, [isFixture, hasDocument]);
}

/**
 * The editor chrome: top bar, toolbar, and below it the viewport next to the side panel.
 * `canSignOut` is false in fixture mode, where edits stay local and nothing talks to Supabase.
 */
export function Editor({ canSignOut, onRetry, isFixture = false }: { canSignOut: boolean; onRetry?: () => void; isFixture?: boolean }) {
  const client = useMemo(() => (isFixture ? null : getSupabase()), [isFixture]);
  const commands = useMemo(
    () => createEditorCommands(client ? createSupabaseDocumentWriterDeps(client) : createLocalOnlyDocumentWriterDeps(), { isHistoryEnabled: client !== null }),
    [client],
  );
  const history = useHistoryState(client);
  useEffect(() => {
    setEditorCommands(commands);
    return () => setEditorCommands(null);
  }, [commands]);
  useShortcuts(commands);
  useSelectionSync(client);
  usePruneSelection();
  useDevHooks(isFixture);

  return (
    <EditorCommandsContext value={commands}>
      <div className="app-shell">
        <header className="top-bar">
          <div className="top-bar-brand">
            <BrandMark size="small" />
            <p className="caps top-bar-title">{de.app.title}</p>
          </div>
          {canSignOut && <button className="button" type="button" onClick={() => void signOut()}>{de.auth.signOut}</button>}
        </header>
        <Toolbar history={history} />
        <ErrorStrip onRetry={onRetry} />
        <div className="editor-main">
          <div className="viewport">
            <SceneOrMessage onRetry={onRetry} />
          </div>
          <SidePanel />
        </div>
        <ShortcutDialog />
      </div>
    </EditorCommandsContext>
  );
}

export function NoAccess(): ReactNode {
  return (
    <main className="screen-center">
      <div className="panel">
        <h1 className="display">{de.data.noAccess}</h1>
        <p className="muted">{de.data.noAccessHint}</p>
        <button className="button" type="button" onClick={() => void signOut()}>{de.auth.signOut}</button>
      </div>
    </main>
  );
}
