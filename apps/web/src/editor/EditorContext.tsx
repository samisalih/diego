import { createContext, use } from "react";
import type { EditorCommands } from "./commands.ts";

export const EditorCommandsContext = createContext<EditorCommands | null>(null);

export function useEditorCommands(): EditorCommands {
  const commands = use(EditorCommandsContext);
  if (!commands) throw new Error("useEditorCommands needs an EditorCommandsContext provider");
  return commands;
}
