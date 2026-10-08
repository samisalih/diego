import { ToonDecodeError } from "@toon-format/toon";
import { assetContentHash, materialContentHash, modelContentHash } from "../hash.ts";
import { createId, type IdPrefix } from "../ids.ts";
import { OPENING_MATERIAL_FIELDS, ROOM_MATERIAL_FIELDS } from "../schemas/apartment.ts";
import type { Asset } from "../schemas/asset.ts";
import type { DocumentContent } from "../schemas/document.ts";
import { exportBundleSchema, type ExportBundle } from "../schemas/export.ts";
import type { Material } from "../schemas/material.ts";
import type { Model } from "../schemas/model.ts";
import { decodeToon, detectFormat, locatePayload, type TextFormat } from "../toon.ts";
import { safeParseWithIssues, type Result, type ValidationIssue } from "../validation.ts";
import type { EntityPool } from "./bundle.ts";

export type ImportIssue = ValidationIssue & { line?: number };

export type EntityPlan<T> = { create: T[]; reuse: Record<string, string> };

export type ImportPlan = {
  content: DocumentContent;
  assets: EntityPlan<Asset>;
  materials: EntityPlan<Material>;
  models: EntityPlan<Model>;
};

type IdMap = Record<string, string>;

const ROOT_FIELD = "bundle";

// ---------- parsing ----------

// Removes commas directly before a closing bracket, leaving strings and line breaks untouched.
function removeTrailingCommas(json: string): string {
  let result = "";
  let inString = false;
  for (let index = 0; index < json.length; index++) {
    const char = json.charAt(index);
    if (inString) {
      if (char === "\\") result += char + json.charAt(++index);
      else {
        if (char === '"') inString = false;
        result += char;
      }
      continue;
    }
    if (char === '"') inString = true;
    if (char === "," && /^\s*[}\]]/.test(json.slice(index + 1))) continue;
    result += char;
  }
  return result;
}

function findJsonErrorLine(message: string, json: string): number {
  const reportedLine = /\(line (\d+)/.exec(message);
  if (reportedLine) return Number(reportedLine[1]);
  const position = /position (\d+)/.exec(message);
  return position ? json.slice(0, Number(position[1])).split("\n").length : 1;
}

function syntaxFailure(message: string, allowed: string, line: number | undefined): { ok: false; issues: ImportIssue[] } {
  const issue: ImportIssue = { field: ROOT_FIELD, value: undefined, allowed, message };
  if (line !== undefined) issue.line = line;
  return { ok: false, issues: [issue] };
}

function parseJson(payload: string): Result<unknown> {
  const json = removeTrailingCommas(payload);
  try {
    return { ok: true, value: JSON.parse(json) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return syntaxFailure(message, "valid JSON", findJsonErrorLine(message, json));
  }
}

function parseToon(payload: string): Result<unknown> {
  try {
    return { ok: true, value: decodeToon(payload) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return syntaxFailure(message, "valid TOON", error instanceof ToonDecodeError ? error.line : undefined);
  }
}

function shiftLine(issue: ImportIssue, lineOffset: number): ImportIssue {
  return issue.line === undefined ? issue : { ...issue, line: issue.line + lineOffset };
}

export function parseImport(text: string, format: TextFormat = detectFormat(text)): Result<ExportBundle> {
  const { payload, lineOffset } = locatePayload(text);
  if (payload === "") return syntaxFailure("Empty input", "a JSON or TOON export bundle", 1);
  const parsed = format === "toon" ? parseToon(payload) : parseJson(payload);
  if (!parsed.ok) return { ok: false, issues: parsed.issues.map((issue) => shiftLine(issue, lineOffset)) };
  const validated = safeParseWithIssues(exportBundleSchema, parsed.value);
  if (validated.ok) return validated;
  return { ok: false, issues: validated.issues.map((issue) => ({ ...issue, field: issue.field || ROOT_FIELD })) };
}

// ---------- planning ----------

function remapFields<T extends object>(entry: T, fields: readonly string[], idMap: IdMap): T {
  const copy = { ...entry } as Record<string, unknown>;
  for (const field of fields) {
    const id = copy[field];
    if (typeof id === "string") copy[field] = idMap[id] ?? id;
  }
  return copy as T;
}

function planEntities<T extends { id: string }>(
  entities: T[],
  existing: T[],
  hash: (entity: T) => string,
  prefix: IdPrefix,
): { plan: EntityPlan<T>; idMap: IdMap } {
  const existingIdsByHash = new Map(existing.map((entity) => [hash(entity), entity.id]));
  const plan: EntityPlan<T> = { create: [], reuse: {} };
  const idMap: IdMap = {};
  for (const entity of entities) {
    const existingId = existingIdsByHash.get(hash(entity));
    if (existingId !== undefined) {
      plan.reuse[entity.id] = existingId;
      idMap[entity.id] = existingId;
    } else {
      const freshId = createId(prefix);
      plan.create.push({ ...entity, id: freshId });
      idMap[entity.id] = freshId;
    }
  }
  return { plan, idMap };
}

function remapAsset(asset: Asset, materialIds: IdMap, modelIds: IdMap): Asset {
  const parts = asset.parts.map((part) => remapFields(remapFields(part, ["materialId"], materialIds), ["modelId"], modelIds));
  return { ...asset, parts };
}

function remapDocument(content: DocumentContent, materialIds: IdMap, assetIds: IdMap): DocumentContent {
  const { rooms, openings } = content.apartment;
  return {
    ...content,
    apartment: {
      ...content.apartment,
      rooms: rooms.map((room) => remapFields(room, ROOM_MATERIAL_FIELDS, materialIds)),
      openings: openings.map((opening) => remapFields(opening, OPENING_MATERIAL_FIELDS, materialIds)),
    },
    items: content.items.map((item) => remapFields(item, ["assetId"], assetIds)),
  };
}

export function planImport(bundle: ExportBundle, existing: EntityPool): ImportPlan {
  const materials = planEntities(bundle.materials, existing.materials, materialContentHash, "mat");
  const models = planEntities(bundle.models, existing.models, modelContentHash, "model");
  // Assets are hashed after their references are remapped, so a remapped material alone does not make them differ.
  const remappedAssets = bundle.assets.map((asset) => remapAsset(asset, materials.idMap, models.idMap));
  const assets = planEntities(remappedAssets, existing.assets, assetContentHash, "asset");
  return {
    content: remapDocument(bundle.document, materials.idMap, assets.idMap),
    assets: assets.plan,
    materials: materials.plan,
    models: models.plan,
  };
}
