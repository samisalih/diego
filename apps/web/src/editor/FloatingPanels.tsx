import { useRef, type ReactNode } from "react";
import { BrandMark } from "../app/BrandMark.tsx";
import { de } from "../i18n/de.ts";
import { AccountMenu } from "./AccountMenu.tsx";
import { DocumentName } from "./DocumentName.tsx";
import { CloseIcon, ListIcon, SlidersIcon } from "./icons.tsx";
import { Inspector } from "./Inspector.tsx";
import type { PanelLayout } from "./usePanelLayout.ts";
import { Tree } from "./Tree.tsx";

/** Focus follows a collapse or expand to the counterpart button, so keyboard users keep their place. */
function useFocusHandOver(toggle: () => void) {
  const shouldFocusOpenButton = useRef(false);
  return {
    collapse: (): void => {
      shouldFocusOpenButton.current = true;
      toggle();
    },
    focusOpenButton: (button: HTMLButtonElement | null): void => {
      if (!button || !shouldFocusOpenButton.current) return;
      shouldFocusOpenButton.current = false;
      button.focus();
    },
  };
}

function CollapseButton({ onClick }: { onClick: () => void }) {
  return (
    <button autoFocus className="icon-button" type="button" aria-label={de.panel.collapse} title={de.panel.collapse} onClick={onClick}>
      <CloseIcon />
    </button>
  );
}

/** Left: brand, account menu, document name, load error and the tree. `notice` is the error block. */
export function LeftPanel({ layout, canSignOut, notice }: { layout: PanelLayout; canSignOut: boolean; notice: ReactNode }) {
  const focus = useFocusHandOver(layout.toggleLeft);
  if (!layout.isLeftOpen) {
    return (
      <button ref={focus.focusOpenButton} className="float-button float-button-left" type="button" aria-label={de.panel.openTree} title={de.panel.openTree} onClick={layout.toggleLeft}>
        <ListIcon />
      </button>
    );
  }
  return (
    <aside className="float-panel float-panel-left" aria-label={de.panel.label}>
      <header className="panel-header">
        <BrandMark size="small" />
        <p className="caps brand-title">{de.app.title}</p>
        <span className="panel-header-spacer" />
        {canSignOut && <AccountMenu />}
        {layout.isNarrow && <CollapseButton onClick={focus.collapse} />}
      </header>
      <div className="panel-document">
        <DocumentName />
      </div>
      {notice}
      <div className="panel-scroll">
        <Tree />
      </div>
    </aside>
  );
}

/** Right: the inspector. */
export function RightPanel({ layout }: { layout: PanelLayout }) {
  const focus = useFocusHandOver(layout.toggleRight);
  if (!layout.isRightOpen) {
    return (
      <button ref={focus.focusOpenButton} className="float-button float-button-right" type="button" aria-label={de.panel.openInspector} title={de.panel.openInspector} onClick={layout.toggleRight}>
        <SlidersIcon />
      </button>
    );
  }
  return (
    <aside className="float-panel float-panel-right" aria-label={de.panel.inspectorLabel}>
      {layout.isNarrow && (
        <header className="panel-header">
          <span className="panel-header-spacer" />
          <CollapseButton onClick={focus.collapse} />
        </header>
      )}
      <div className="panel-scroll">
        <Inspector />
      </div>
    </aside>
  );
}
