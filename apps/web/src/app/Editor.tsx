import type { ReactNode } from "react";
import { signOut } from "../auth/signIn.ts";
import { useSceneStore } from "../data/store.ts";
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

/** The editor chrome (a flat top bar) around the viewport; `canSignOut` is false in fixture mode. */
export function Editor({ canSignOut, onRetry }: { canSignOut: boolean; onRetry?: () => void }) {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-brand">
          <BrandMark size="small" />
          <p className="caps top-bar-title">{de.app.title}</p>
        </div>
        {canSignOut && <button className="button" type="button" onClick={() => void signOut()}>{de.auth.signOut}</button>}
      </header>
      <div className="viewport">
        <SceneOrMessage onRetry={onRetry} />
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
