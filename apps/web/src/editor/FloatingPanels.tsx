import type { ReactNode } from "react";
import { BrandMark } from "../app/BrandMark.tsx";
import { de } from "../i18n/de.ts";
import { AccountMenu } from "./AccountMenu.tsx";
import { DocumentName } from "./DocumentName.tsx";
import { CloseIcon, ListIcon, SlidersIcon } from "./icons.tsx";
import { Inspector } from "./Inspector.tsx";
import type { PanelLayout } from "./usePanelLayout.ts";
import { Tree } from "./Tree.tsx";

function CollapseButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="icon-button" type="button" aria-label={de.panel.collapse} title={de.panel.collapse} onClick={onClick}>
      <CloseIcon />
    </button>
  );
}

/** Left: brand, account menu, document name, load error and the tree. `notice` is the error block. */
export function LeftPanel({ layout, canSignOut, notice }: { layout: PanelLayout; canSignOut: boolean; notice: ReactNode }) {
  if (!layout.isLeftOpen) {
    return (
      <button className="float-button float-button-left" type="button" aria-label={de.panel.openTree} title={de.panel.openTree} onClick={layout.toggleLeft}>
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
        {layout.isNarrow && <CollapseButton onClick={layout.toggleLeft} />}
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
  if (!layout.isRightOpen) {
    return (
      <button className="float-button float-button-right" type="button" aria-label={de.panel.openInspector} title={de.panel.openInspector} onClick={layout.toggleRight}>
        <SlidersIcon />
      </button>
    );
  }
  return (
    <aside className="float-panel float-panel-right" aria-label={de.panel.inspectorLabel}>
      {layout.isNarrow && (
        <header className="panel-header">
          <span className="panel-header-spacer" />
          <CollapseButton onClick={layout.toggleRight} />
        </header>
      )}
      <div className="panel-scroll">
        <Inspector />
      </div>
    </aside>
  );
}
