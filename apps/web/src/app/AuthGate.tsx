import type { ReactNode } from "react";
import { LoginScreen } from "../auth/LoginScreen.tsx";
import { useSession } from "../auth/useSession.ts";
import { de } from "../i18n/de.ts";

/** Renders its children only with a session; otherwise the login screen. */
export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session === undefined) return <main className="screen-center"><p className="muted">{de.auth.checkingSession}</p></main>;
  if (session === null) return <LoginScreen />;
  return children;
}
