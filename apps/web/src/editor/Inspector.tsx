import { polygonArea, wallLength, type Asset, type AssetParam, type Item, type LayoutIssue } from "@app/core";
import { useSceneStore } from "../data/store.ts";
import type { PlannerDocument } from "../data/mappers.ts";
import { de } from "../i18n/de.ts";
import { REFUSED_EDIT, type EditorCommands } from "./commands.ts";
import { useEditorCommands } from "./EditorContext.tsx";
import { useEditorStore } from "./editorStore.ts";
import { FactList, LedCheckbox, NumberField, SliderField, TextField } from "./fields.tsx";
import { formatNumber } from "./format.ts";
import { useEffectiveItems, useLayoutAnalysis } from "./layoutAnalysis.ts";
import { formatIssue } from "./layoutFeedback.ts";
import { itemLabel } from "./Tree.tsx";

const PARAM_UNIT_LABELS: Record<AssetParam["unit"], string> = { m: de.inspector.unitMetres, deg: de.inspector.unitDegrees, count: "", factor: de.inspector.unitFactor };
const POSITION_STEP_M = 0.01;
const ROTATION_STEP_DEG = 1;

function yesNo(value: boolean | undefined): string {
  return value ? de.inspector.yes : de.inspector.no;
}

function namesById(document: PlannerDocument, items: Item[], assets: ReadonlyMap<string, Asset>): Map<string, string> {
  const names = new Map<string, string>();
  for (const item of items) names.set(item.id, itemLabel(item, assets));
  for (const opening of document.apartment.openings) names.set(opening.id, de.openingTypes[opening.type]);
  return names;
}

function IssueList({ issues, names, forId }: { issues: LayoutIssue[]; names: Map<string, string>; forId: string }) {
  const entries = issues.flatMap((issue, index) => {
    const text = formatIssue(issue, names, forId);
    return text === null ? [] : [{ key: `${issue.kind}:${issue.subjectId}:${issue.objectId ?? ""}:${index}`, text }];
  });
  if (entries.length === 0) return null;
  return (
    <section className="inspector-section">
      <h3 className="caps panel-title">{de.inspector.issues}</h3>
      <ul className="issue-list">
        {entries.map(({ key, text }) => (
          <li key={key}><span className="dot-red" aria-hidden="true" />{text}</li>
        ))}
      </ul>
    </section>
  );
}

function ParamFields({ item, asset }: { item: Item; asset: Asset }) {
  const commands = useEditorCommands();
  if (asset.params.length === 0) return null;
  return (
    <section className="inspector-section">
      <h3 className="caps panel-title">{de.inspector.params}</h3>
      {asset.params.map((param) => {
        const value = item.params[param.key] ?? param.default;
        const isClamped = item.clampedParams?.includes(param.key) ?? false;
        return (
          <SliderField
            key={param.key}
            label={param.label}
            value={value}
            min={param.min}
            max={param.max}
            step={param.step}
            unit={PARAM_UNIT_LABELS[param.unit]}
            isAdjusted={isClamped || Math.abs(value - param.default) > 1e-9}
            onCommit={(next) => commands.updateItem(item.id, { params: { [param.key]: next } })}
          />
        );
      })}
    </section>
  );
}

/** An empty name falls back to the asset name (null); a name of only blanks is refused. */
function commitItemName(commands: EditorCommands, itemId: string, name: string) {
  const trimmed = name.trim();
  if (name !== "" && trimmed === "") return Promise.resolve(REFUSED_EDIT);
  return commands.updateItem(itemId, { name: trimmed === "" ? null : trimmed });
}

function ItemInspector({ item, names }: { item: Item; names: Map<string, string> }) {
  const commands = useEditorCommands();
  const assets = useSceneStore((state) => state.assets);
  const analysis = useLayoutAnalysis();
  const asset = assets.get(item.assetId);
  return (
    <div className="inspector-body">
      <section className="inspector-section">
        <TextField label={de.inspector.name} value={item.name ?? ""} placeholder={asset?.name} onCommit={(name) => commitItemName(commands, item.id, name)} />
        <NumberField label={de.inspector.positionX} value={item.x} step={POSITION_STEP_M} unit={de.inspector.unitMetres} disabled={item.locked} onCommit={(x) => commands.updateItem(item.id, { x })} />
        <NumberField label={de.inspector.positionZ} value={item.z} step={POSITION_STEP_M} unit={de.inspector.unitMetres} disabled={item.locked} onCommit={(z) => commands.updateItem(item.id, { z })} />
        <NumberField label={de.inspector.rotation} value={item.rotation} step={ROTATION_STEP_DEG} unit={de.inspector.unitDegrees} disabled={item.locked} onCommit={(rotation) => commands.updateItem(item.id, { rotation })} />
        {item.locked && <p className="hint">{de.inspector.lockedHint}</p>}
      </section>
      {asset && <ParamFields item={item} asset={asset} />}
      <section className="inspector-section">
        <LedCheckbox label={de.inspector.locked} checked={item.locked} onChange={(locked) => void commands.updateItem(item.id, { locked })} />
        <LedCheckbox label={de.inspector.hidden} checked={item.hidden} onChange={(hidden) => void commands.updateItem(item.id, { hidden })} />
      </section>
      <IssueList issues={analysis?.bySubject.get(item.id) ?? []} names={names} forId={item.id} />
    </div>
  );
}

function BulkInspector({ count }: { count: number }) {
  const commands = useEditorCommands();
  return (
    <div className="inspector-body">
      <p className="inspector-count">{de.inspector.selectedCount(count)}</p>
      <div className="bulk-actions">
        <button className="button" type="button" onClick={() => void commands.duplicateSelected()}>{de.toolbar.duplicate}</button>
        <button className="button" type="button" onClick={() => void commands.removeSelected()}>{de.toolbar.delete}</button>
        <button className="button" type="button" onClick={() => void commands.toggleLockSelected()}>{de.toolbar.lock} / {de.toolbar.unlock}</button>
        <button className="button" type="button" onClick={() => void commands.toggleHiddenSelected()}>{de.toolbar.hide} / {de.toolbar.show}</button>
      </div>
    </div>
  );
}

function FocusInspector({ document, focusId }: { document: PlannerDocument; focusId: string }) {
  const { rooms, walls, openings } = document.apartment;
  const room = rooms.find((entry) => entry.id === focusId);
  const wall = walls.find((entry) => entry.id === focusId);
  const opening = openings.find((entry) => entry.id === focusId);
  const metres = (value: number): string => `${formatNumber(value, 2)} ${de.inspector.unitMetres}`;
  if (room) {
    return <FactList facts={[[de.inspector.name, room.name], [de.inspector.roomArea, `${formatNumber(polygonArea(room.polygon))} ${de.inspector.unitSquareMetres}`], [de.inspector.estimated, yesNo(room.estimated)]]} />;
  }
  if (wall) {
    return (
      <FactList
        facts={[
          [de.inspector.wallLength, metres(wallLength(wall))],
          [de.inspector.wallThickness, metres(wall.thickness)],
          [de.inspector.wallKind, wall.exterior ? de.inspector.wallExterior : de.inspector.wallInterior],
          [de.inspector.estimated, yesNo(wall.estimated)],
        ]}
      />
    );
  }
  if (opening) {
    return (
      <FactList
        facts={[
          [de.inspector.openingType, de.openingTypes[opening.type]],
          [de.inspector.openingWidth, metres(opening.width)],
          [de.inspector.openingHeight, metres(opening.height)],
          [de.inspector.openingSill, metres(opening.sillHeight)],
          [de.inspector.estimated, yesNo(opening.estimated)],
        ]}
      />
    );
  }
  return null;
}

function DocumentSummary({ document }: { document: PlannerDocument }) {
  const totalArea = document.apartment.rooms.reduce((sum, room) => sum + polygonArea(room.polygon), 0);
  return (
    <FactList
      facts={[
        [de.inspector.summaryRooms, String(document.apartment.rooms.length)],
        [de.inspector.summaryItems, String(document.items.length)],
        [de.inspector.summaryArea, `${formatNumber(totalArea)} ${de.inspector.unitSquareMetres}`],
      ]}
    />
  );
}

/** The inspector below the tree: summary, one item with editable fields, a bulk selection, or read-only facts of a focus. */
export function Inspector() {
  const document = useSceneStore((state) => state.document);
  const assets = useSceneStore((state) => state.assets);
  const selection = useEditorStore((state) => state.selection);
  const items = useEffectiveItems();
  if (!document) return null;
  const selectedItems = items.filter((item) => selection.selectedIds.includes(item.id));
  const [only] = selectedItems;
  let content;
  if (selectedItems.length > 1) content = <BulkInspector count={selectedItems.length} />;
  else if (only) content = <ItemInspector item={only} names={namesById(document, items, assets)} />;
  else if (selection.focusId !== null) content = <FocusInspector document={document} focusId={selection.focusId} />;
  else content = <DocumentSummary document={document} />;
  return <section className="inspector" aria-label={de.panel.inspectorLabel}>{content}</section>;
}
