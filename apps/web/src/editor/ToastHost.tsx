import { useEffect } from "react";
import { useEditorStore } from "./editorStore.ts";

const TOAST_DURATION_MS = 4500;

/** A small toast at the bottom of the side panel; it hides itself. */
export function ToastHost() {
  const toast = useEditorStore((state) => state.toast);
  const dismissToast = useEditorStore((state) => state.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismissToast, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      {toast.message}
    </div>
  );
}
