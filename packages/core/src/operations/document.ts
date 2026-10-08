import { z } from "zod";
import { safeParseWithIssues } from "../validation.ts";
import { documentContentSchema, type DocumentContent } from "../schemas/document.ts";
import { fail, validateResult, type OperationResult } from "./result.ts";

const documentNameSchema = z.object({ name: z.string().min(1).max(120) });

/** Renames the document (1..120 characters). */
export function setDocumentName(content: DocumentContent, name: string): OperationResult<DocumentContent> {
  const parsed = safeParseWithIssues(documentNameSchema, { name });
  if (!parsed.ok) return fail(parsed.issues);
  return validateResult(documentContentSchema, { ...content, name: parsed.value.name }, []);
}
