import type { LayoutIssue } from "@app/core";
import { de } from "../i18n/de.ts";

/** Indexes issues under their subject and their object, in input order. */
export function issuesBySubject(issues: LayoutIssue[]): Map<string, LayoutIssue[]> {
  const map = new Map<string, LayoutIssue[]>();
  for (const issue of issues) {
    for (const id of new Set([issue.subjectId, issue.objectId])) {
      if (id === null) continue;
      map.set(id, [...(map.get(id) ?? []), issue]);
    }
  }
  return map;
}

function nameOf(id: string | null, namesById: ReadonlyMap<string, string>): string {
  if (id !== null && id.startsWith("wall_")) return de.layoutIssues.wall;
  return (id !== null && namesById.get(id)) || de.layoutIssues.otherObject;
}

function formatCollision(issue: LayoutIssue, namesById: ReadonlyMap<string, string>, forId: string): string {
  const otherId = forId === issue.subjectId ? issue.objectId : issue.subjectId;
  return de.layoutIssues.collision(nameOf(otherId, namesById));
}

/** German text of an issue written for one entity; null for kinds that are shown as a marker only. */
export function formatIssue(issue: LayoutIssue, namesById: ReadonlyMap<string, string>, forId: string = issue.subjectId): string | null {
  switch (issue.kind) {
    case "collision":
      return formatCollision(issue, namesById, forId);
    case "narrowPassage":
      return de.layoutIssues.narrowPassage(Math.round((issue.value ?? 0) * 100));
    case "blockedOpening":
      return de.layoutIssues.blockedOpening(namesById.get(issue.subjectId) ?? de.layoutIssues.openingFallback);
    case "outsideRoom":
      return de.layoutIssues.outsideRoom;
    case "clampedParam":
      return de.layoutIssues.clampedParam((issue.detail ?? "").split(",").join(", "));
    case "unknownAsset":
      return de.layoutIssues.unknownAsset;
    case "adjustedParam":
      return null;
  }
}
