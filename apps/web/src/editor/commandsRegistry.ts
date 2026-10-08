import type { EditorCommands } from "./commands.ts";

// The 3D canvas renders in its own React root, where React context does not reach; the commands are shared this way.
let current: EditorCommands | null = null;

export function setEditorCommands(commands: EditorCommands | null): void {
  current = commands;
}

export function getEditorCommands(): EditorCommands | null {
  return current;
}
