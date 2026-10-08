import { assetFootprint, itemObb, obbAxes, resolveAsset, wallObb, type Asset, type Item, type LayoutIssue, type Obb, type Vec2, type Wall } from "@app/core";

/** Issue kinds that mark an item red in the viewport. */
const OUTLINE_ISSUE_KINDS: ReadonlySet<LayoutIssue["kind"]> = new Set(["collision", "blockedOpening", "outsideRoom"]);

export type OutlineGroups = { blueIds: string[]; redIds: string[] };

/** Selected items get the blue outline; unselected items with a collision, blocked opening or outside-room issue get the red one. */
export function outlineGroups(items: Item[], selectedIds: readonly string[], issues: LayoutIssue[]): OutlineGroups {
  const existing = new Set(items.map((item) => item.id));
  const selected = new Set(selectedIds);
  const flagged = new Set(
    issues.filter((issue) => OUTLINE_ISSUE_KINDS.has(issue.kind)).flatMap((issue) => [issue.subjectId, issue.objectId ?? ""]).filter((id) => existing.has(id)),
  );
  return {
    blueIds: items.filter((item) => selected.has(item.id)).map((item) => item.id),
    redIds: items.filter((item) => flagged.has(item.id) && !selected.has(item.id)).map((item) => item.id),
  };
}

/** The ground footprint of an item; null when its asset is unknown. */
export function footprintOf(item: Item, assetsById: ReadonlyMap<string, Asset>): Obb | null {
  const asset = assetsById.get(item.assetId);
  return asset ? itemObb(item, assetFootprint(resolveAsset(asset, item.params))) : null;
}

/** Footprints of selected items that have a collision, blocked opening or outside-room issue. */
export function flaggedSelectedFootprints(items: Item[], selectedIds: readonly string[], assetsById: ReadonlyMap<string, Asset>, issues: LayoutIssue[]): Obb[] {
  const selected = new Set(selectedIds);
  const flaggedIds = new Set(
    issues.filter((issue) => OUTLINE_ISSUE_KINDS.has(issue.kind)).flatMap((issue) => [issue.subjectId, issue.objectId ?? ""]),
  );
  return items.filter((item) => selected.has(item.id) && flaggedIds.has(item.id)).flatMap((item) => footprintOf(item, assetsById) ?? []);
}

function corners(box: Obb): Vec2[] {
  const [axisX, axisZ] = obbAxes(box);
  return ([[1, 1], [1, -1], [-1, -1], [-1, 1]] as const).map(([signX, signZ]) => [
    box.cx + axisX[0] * box.hx * signX + axisZ[0] * box.hz * signZ,
    box.cz + axisX[1] * box.hx * signX + axisZ[1] * box.hz * signZ,
  ]);
}

function closestPointOnSegment(point: Vec2, start: Vec2, end: Vec2): Vec2 {
  const [dx, dz] = [end[0] - start[0], end[1] - start[1]];
  const lengthSquared = dx * dx + dz * dz;
  const share = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared));
  return [start[0] + dx * share, start[1] + dz * share];
}

/** The two closest points of two separate boxes: the shortest vertex-to-edge connection of either one. */
export function closestPoints(first: Obb, second: Obb): [Vec2, Vec2] {
  let best: [Vec2, Vec2] = [[first.cx, first.cz], [second.cx, second.cz]];
  let bestDistance = Infinity;
  const consider = (own: Obb, other: Obb, isFirst: boolean): void => {
    const otherCorners = corners(other);
    for (const corner of corners(own)) {
      otherCorners.forEach((start, index) => {
        const onEdge = closestPointOnSegment(corner, start, otherCorners[(index + 1) % otherCorners.length]!);
        const distance = Math.hypot(onEdge[0] - corner[0], onEdge[1] - corner[1]);
        if (distance >= bestDistance) return;
        bestDistance = distance;
        best = isFirst ? [corner, onEdge] : [onEdge, corner];
      });
    }
  };
  consider(first, second, true);
  consider(second, first, false);
  return best;
}

export type PassageLine = { key: string; from: Vec2; to: Vec2; centimetres: number };

/** One measurement line per narrow passage issue, between the two obstacles (items or walls). */
export function passageLines(issues: LayoutIssue[], items: Item[], walls: Wall[], assetsById: ReadonlyMap<string, Asset>): PassageLine[] {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const wallsById = new Map(walls.map((wall) => [wall.id, wall]));
  const boxOf = (id: string | null): Obb | null => {
    if (id === null) return null;
    const item = itemsById.get(id);
    if (item) return footprintOf(item, assetsById);
    const wall = wallsById.get(id);
    return wall ? wallObb(wall) : null;
  };
  return issues
    .filter((issue) => issue.kind === "narrowPassage")
    .flatMap((issue) => {
      const [first, second] = [boxOf(issue.subjectId), boxOf(issue.objectId)];
      if (!first || !second) return [];
      const [from, to] = closestPoints(first, second);
      return [{ key: `${issue.subjectId}:${issue.objectId}`, from, to, centimetres: Math.round((issue.value ?? 0) * 100) }];
    });
}
