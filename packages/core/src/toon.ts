import { decode, encode } from "@toon-format/toon";

export type TextFormat = "json" | "toon";

const BYTE_ORDER_MARK = "﻿";
const CODE_FENCE = /```[^\n]*\n([\s\S]*?)```/;

export function encodeToon(value: unknown): string {
  return encode(value, { indentSize: 2, delimiter: "," });
}

export function decodeToon(text: string): unknown {
  return decode(text, { indentSize: 2, strict: true });
}

// Drops BOM, surrounding whitespace and a Markdown code fence (with any prose around it).
// `lineOffset` is the number of original lines before the payload, for reporting original line numbers.
export function locatePayload(text: string): { payload: string; lineOffset: number } {
  const withoutBom = text.replace(BYTE_ORDER_MARK, "");
  const trimmed = withoutBom.trim();
  const isBare = trimmed.startsWith("{") || trimmed.startsWith("[");
  const fenced = isBare ? null : CODE_FENCE.exec(trimmed);
  const payload = fenced ? fenced[1]!.trim() : trimmed;
  const payloadStart = Math.max(0, withoutBom.indexOf(payload));
  return { payload, lineOffset: withoutBom.slice(0, payloadStart).split("\n").length - 1 };
}

export function extractPayload(text: string): string {
  return locatePayload(text).payload;
}

export function detectFormat(text: string): TextFormat {
  const first = extractPayload(text).charAt(0);
  return first === "{" || first === "[" ? "json" : "toon";
}
