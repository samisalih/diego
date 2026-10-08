import { useEffect } from "react";
import { isFixtureMode, loadFixtureScene } from "../data/fixture.ts";
import { useSceneSync } from "../data/useSceneSync.ts";
import { AuthGate } from "./AuthGate.tsx";
import { Editor, NoAccess } from "./Editor.tsx";

function FixtureEditor() {
  useEffect(() => {
    void loadFixtureScene();
  }, []);
  return <Editor canSignOut={false} />;
}

function SyncedEditor() {
  const access = useSceneSync(true);
  if (access === "denied") return <NoAccess />;
  return <Editor canSignOut />;
}

export function EditorRoute() {
  if (import.meta.env.DEV && isFixtureMode()) return <FixtureEditor />;
  return (
    <AuthGate>
      <SyncedEditor />
    </AuthGate>
  );
}
