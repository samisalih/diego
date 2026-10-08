import { useEffect, useState } from "react";
import { useEditorStore } from "./editorStore.ts";
import { insetsFor, NARROW_QUERY } from "./layoutMetrics.ts";

export type PanelLayout = {
  isNarrow: boolean;
  isLeftOpen: boolean;
  isRightOpen: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
};

/**
 * Which panels are open. On a wide window both always are; on a narrow one they start collapsed to an icon
 * button and the user opens them. Publishes what the open panels cover so the camera can frame the free area.
 */
export function usePanelLayout(): PanelLayout {
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  const [wantsLeft, setWantsLeft] = useState(false);
  const [wantsRight, setWantsRight] = useState(false);
  const setInsets = useEditorStore((state) => state.setInsets);

  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const handleChange = (): void => setIsNarrow(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  const isLeftOpen = !isNarrow || wantsLeft;
  const isRightOpen = !isNarrow || wantsRight;

  useEffect(() => {
    setInsets(insetsFor({ isLeftOpen, isRightOpen }));
  }, [isLeftOpen, isRightOpen, setInsets]);

  return {
    isNarrow,
    isLeftOpen,
    isRightOpen,
    toggleLeft: () => setWantsLeft((wants) => !wants),
    toggleRight: () => setWantsRight((wants) => !wants),
  };
}
