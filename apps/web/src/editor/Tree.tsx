import { polygonArea, wallLength, type Asset, type Item, type LayoutIssue, type Opening, type Room, type Wall } from "@app/core";
import type { MouseEvent } from "react";
import { useSceneStore } from "../data/store.ts";
import { de } from "../i18n/de.ts";
import { useEditorStore } from "./editorStore.ts";
import { formatNumber } from "./format.ts";
import { LockIcon, EyeOffIcon } from "./icons.tsx";
import { useEffectiveItems, useLayoutAnalysis } from "./layoutAnalysis.ts";
import { isToggleModifier } from "./selectionModifiers.ts";
import { openingsOfWall, wallsOfRoom } from "./roomTree.ts";

const PROBLEM_KINDS: ReadonlySet<LayoutIssue["kind"]> = new Set(["collision", "narrowPassage", "blockedOpening", "outsideRoom", "unknownAsset"]);

export function itemLabel(item: Item, assets: ReadonlyMap<string, Asset>): string {
  return item.name ?? assets.get(item.assetId)?.name ?? item.assetId;
}

function hasProblem(issues: LayoutIssue[] | undefined): boolean {
  return (issues ?? []).some((issue) => PROBLEM_KINDS.has(issue.kind));
}

function ItemRow({ item, label, isSelected, issues }: { item: Item; label: string; isSelected: boolean; issues: LayoutIssue[] | undefined }) {
  const dispatchSelection = useEditorStore((state) => state.dispatchSelection);
  const handleClick = (event: MouseEvent): void => {
    dispatchSelection({ type: isToggleModifier(event) ? "toggle" : "select", id: item.id });
  };
  const hasClamped = (item.clampedParams?.length ?? 0) > 0;
  return (
    <li>
      <button type="button" className={`tree-row${isSelected ? " is-selected" : ""}${item.hidden ? " is-hidden" : ""}`} aria-pressed={isSelected} onClick={handleClick}>
        <span className="tree-row-label">{label}</span>
        <span className="tree-markers">
          {hasClamped && <span className="dot-mustard" role="img" aria-label={de.panel.clampedMarker} title={de.panel.clampedMarker} />}
          {hasProblem(issues) && <span className="dot-red" role="img" aria-label={de.panel.issueMarker} title={de.panel.issueMarker} />}
          {item.locked && <span className="tree-icon" role="img" aria-label={de.panel.lockedMarker} title={de.panel.lockedMarker}><LockIcon /></span>}
          {item.hidden && <span className="tree-icon" role="img" aria-label={de.panel.hiddenMarker} title={de.panel.hiddenMarker}><EyeOffIcon /></span>}
        </span>
      </button>
    </li>
  );
}

function FocusRow({ id, label, detail, isEstimated, className }: { id: string; label: string; detail: string; isEstimated?: boolean; className?: string }) {
  const focusId = useEditorStore((state) => state.selection.focusId);
  const dispatchSelection = useEditorStore((state) => state.dispatchSelection);
  const isFocused = focusId === id;
  return (
    <button
      type="button"
      className={`tree-row${isFocused ? " is-selected" : ""}${isEstimated ? " is-estimated" : ""}${className ? ` ${className}` : ""}`}
      aria-pressed={isFocused}
      title={isEstimated ? de.panel.estimatedMarker : undefined}
      onClick={() => dispatchSelection({ type: "focus", id })}
    >
      <span className="tree-row-label">{label}</span>
      <span className="tree-detail">{detail}</span>
    </button>
  );
}

function WallRows({ wall, openings }: { wall: Wall; openings: Opening[] }) {
  return (
    <li>
      <FocusRow id={wall.id} label={de.layoutIssues.wall} detail={`${formatNumber(wallLength(wall), 2)} ${de.inspector.unitMetres}`} isEstimated={wall.estimated} />
      {openings.length > 0 && (
        <ul className="tree-list tree-nested">
          {openings.map((opening) => (
            <li key={opening.id}>
              <FocusRow id={opening.id} label={de.openingTypes[opening.type]} detail={`${formatNumber(opening.width, 2)} ${de.inspector.unitMetres}`} isEstimated={opening.estimated} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function RoomGroup({ room, walls, openings }: { room: Room; walls: Wall[]; openings: Opening[] }) {
  const focusId = useEditorStore((state) => state.selection.focusId);
  const dispatchSelection = useEditorStore((state) => state.dispatchSelection);
  const roomWalls = wallsOfRoom(room, walls);
  const isFocused = focusId === room.id;
  return (
    <li>
      <details className="tree-details">
        <summary className={`tree-row${isFocused ? " is-selected" : ""}${room.estimated ? " is-estimated" : ""}`} onClick={() => dispatchSelection({ type: "focus", id: room.id })}>
          <span className="tree-row-label">{room.name}</span>
          <span className="tree-detail">{formatNumber(polygonArea(room.polygon))} {de.inspector.unitSquareMetres}</span>
        </summary>
        <ul className="tree-list tree-nested">
          {roomWalls.map((wall) => (
            <WallRows key={wall.id} wall={wall} openings={openingsOfWall(wall, openings)} />
          ))}
        </ul>
      </details>
    </li>
  );
}

/** Furniture and rooms of the document; furniture selects, rooms / walls / openings focus for read-only inspection. */
export function Tree() {
  const document = useSceneStore((state) => state.document);
  const assets = useSceneStore((state) => state.assets);
  const selectedIds = useEditorStore((state) => state.selection.selectedIds);
  const items = useEffectiveItems();
  const analysis = useLayoutAnalysis();
  if (!document) return null;
  const { rooms, walls, openings } = document.apartment;
  return (
    <nav className="tree" aria-label={de.panel.treeLabel}>
      <h3 className="caps panel-title">{de.panel.furniture}</h3>
      {items.length === 0 ? (
        <p className="muted tree-empty">{de.panel.noFurniture}</p>
      ) : (
        <ul className="tree-list">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} label={itemLabel(item, assets)} isSelected={selectedIds.includes(item.id)} issues={analysis?.bySubject.get(item.id)} />
          ))}
        </ul>
      )}
      <h3 className="caps panel-title">{de.panel.rooms}</h3>
      {rooms.length === 0 ? (
        <p className="muted tree-empty">{de.panel.noRooms}</p>
      ) : (
        <ul className="tree-list">
          {rooms.map((room) => (
            <RoomGroup key={room.id} room={room} walls={walls} openings={openings} />
          ))}
        </ul>
      )}
    </nav>
  );
}
