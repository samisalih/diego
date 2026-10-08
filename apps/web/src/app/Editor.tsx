import type { ReactNode } from "react";
import { signOut } from "../auth/signIn.ts";
import { useSceneStore } from "../data/store.ts";
import { de } from "../i18n/de.ts";
import { Viewport } from "../scene/Viewport.tsx";

function ViewportMessage({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="viewport-message">
      <h2 className="display">{title}</h2>
      {hint && <p className="muted">{hint}</p>}
    </div>
  );
}

function SceneOrMessage() {
  const document = useSceneStore((state) => state.document);
  const status = useSceneStore((state) => state.status);
  const error = useSceneStore((state) => state.error);
  if (document) return <Viewport />;
  if (status === "error") return <ViewportMessage title={error ?? de.data.loadFailed} />;
  if (status === "ready") return <ViewportMessage title={de.data.noDocument} hint={de.data.noDocumentHint} />;
  return <ViewportMessage title={de.app.loading} />;
}

/** The editor chrome (a flat top bar) around the viewport; `canSignOut` is false in fixture mode. */
export function Editor({ canSignOut }: { canSignOut: boolean }) {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <p className="caps top-bar-title">{de.app.title}</p>
        {canSignOut && <button className="button" type="button" onClick={() => void signOut()}>{de.auth.signOut}</button>}
      </header>
      <div className="viewport">
        <SceneOrMessage />
      </div>
    </div>
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
