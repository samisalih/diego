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
export function extractPayload(text: string): string {
  const trimmed = text.replace(BYTE_ORDER_MARK, "").trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const fenced = CODE_FENCE.exec(trimmed);
  return fenced ? fenced[1]!.trim() : trimmed;
}

export function detectFormat(text: string): TextFormat {
  const first = extractPayload(text).charAt(0);
  return first === "{" || first === "[" ? "json" : "toon";
}
