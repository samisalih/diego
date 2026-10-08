import type { Asset, DocumentContent, OperationResult, ValidationIssue } from "@app/core";
import type { PlannerDocument } from "./mappers.ts";

/** An edit of the document content, e.g. a core operation with its arguments bound. */
export type ContentOperation = (content: DocumentContent, assets: Asset[]) => OperationResult<DocumentContent>;

export type SaveArgs = { id: string; expectedVersion: number; content: DocumentContent };
export type HistoryArgs = { id: string; expectedVersion: number };

/** Everything the writer needs from the outside world; injected so the logic stays pure. */
export type DocumentWriterDeps = {
  getDocument: () => PlannerDocument | null;
  getAssets: () => Asset[];
  applyLocal: (document: PlannerDocument) => void;
  /** Resolves with the new version; rejects with a version conflict, not found or any other error. */
  save: (args: SaveArgs) => Promise<number>;
  reload: () => Promise<PlannerDocument | null>;
  /** Resolve with the new version, or null when there is nothing to undo / redo. */
  undoRemote: (args: HistoryArgs) => Promise<number | null>;
  redoRemote: (args: HistoryArgs) => Promise<number | null>;
};

export type FailureReason = "conflict" | "network" | "notFound";
export type Failure = { ok: false; reason: FailureReason; message: string };

export type CommitResult = { ok: true; version: number } | { ok: false; reason: "invalid"; issues: ValidationIssue[] } | Failure;
export type HistoryResult = { ok: true; changed: boolean } | Failure;

const MAX_COMMIT_ATTEMPTS = 3;

function errorMessage(error: unknown): string {
  if (error !== null && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

function errorCode(error: unknown): string | undefined {
  return error !== null && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : undefined;
}

function isConflict(error: unknown): boolean {
  return errorCode(error) === "P0409" || errorMessage(error) === "version_conflict";
}

function isNotFound(error: unknown): boolean {
  return errorCode(error) === "P0404" || errorMessage(error) === "document_not_found";
}

function toFailure(error: unknown): Failure {
  if (isConflict(error)) return { ok: false, reason: "conflict", message: errorMessage(error) };
  if (isNotFound(error)) return { ok: false, reason: "notFound", message: errorMessage(error) };
  return { ok: false, reason: "network", message: errorMessage(error) };
}

const NO_DOCUMENT: Failure = { ok: false, reason: "notFound", message: "No document is loaded" };

function contentOf(document: PlannerDocument): DocumentContent {
  return { name: document.name, apartment: document.apartment, items: document.items, lighting: document.lighting };
}

// One queue per deps object: writes of the same document never race each other, a failure never blocks the next one.
const queues = new WeakMap<object, Promise<unknown>>();

function enqueue<T>(deps: object, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(deps) ?? Promise.resolve();
  const next = previous.then(task, task);
  queues.set(deps, next.catch(() => undefined));
  return next;
}

async function reloadAndApply(deps: DocumentWriterDeps): Promise<PlannerDocument | null> {
  const reloaded = await deps.reload();
  if (reloaded) deps.applyLocal(reloaded);
  return reloaded;
}

async function tryCommit(deps: DocumentWriterDeps, operation: ContentOperation): Promise<CommitResult | "conflict"> {
  const document = deps.getDocument();
  if (!document) return NO_DOCUMENT;
  const result = operation(contentOf(document), deps.getAssets());
  if (!result.ok) return { ok: false, reason: "invalid", issues: result.issues };

  deps.applyLocal({ ...document, ...result.value });
  try {
    const version = await deps.save({ id: document.id, expectedVersion: document.version, content: result.value });
    deps.applyLocal({ ...document, ...result.value, version });
    return { ok: true, version };
  } catch (error) {
    if (isConflict(error)) return "conflict";
    deps.applyLocal(document);
    return toFailure(error);
  }
}

async function runCommit(deps: DocumentWriterDeps, operation: ContentOperation): Promise<CommitResult> {
  for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt += 1) {
    const outcome = await tryCommit(deps, operation);
    if (outcome !== "conflict") return outcome;
    const reloaded = await reloadAndApply(deps);
    if (!reloaded) return NO_DOCUMENT;
  }
  return { ok: false, reason: "conflict", message: "version_conflict" };
}

/**
 * Runs the operation on the current document, shows the result at once and saves it.
 * On a version conflict the same operation is rerun on the reloaded document (at most 3 attempts).
 */
export function commitOperation(deps: DocumentWriterDeps, operation: ContentOperation): Promise<CommitResult> {
  return enqueue(deps, async () => {
    try {
      return await runCommit(deps, operation);
    } catch (error) {
      return toFailure(error);
    }
  });
}

async function runHistory(deps: DocumentWriterDeps, remote: (args: HistoryArgs) => Promise<number | null>): Promise<HistoryResult> {
  let document = deps.getDocument();
  for (let attempt = 1; document; attempt += 1) {
    try {
      const version = await remote({ id: document.id, expectedVersion: document.version });
      if (version === null) return { ok: true, changed: false };
      return (await reloadAndApply(deps)) ? { ok: true, changed: true } : NO_DOCUMENT;
    } catch (error) {
      if (!isConflict(error) || attempt === 2) return toFailure(error);
      document = (await reloadAndApply(deps)) ? deps.getDocument() : null;
    }
  }
  return NO_DOCUMENT;
}

function runQueuedHistory(deps: DocumentWriterDeps, remote: (args: HistoryArgs) => Promise<number | null>): Promise<HistoryResult> {
  return enqueue(deps, async () => {
    try {
      return await runHistory(deps, remote);
    } catch (error) {
      return toFailure(error);
    }
  });
}

/** Undoes the newest revision in the database and refreshes the local document. */
export function undo(deps: DocumentWriterDeps): Promise<HistoryResult> {
  return runQueuedHistory(deps, deps.undoRemote);
}

/** Redoes the oldest undone revision in the database and refreshes the local document. */
export function redo(deps: DocumentWriterDeps): Promise<HistoryResult> {
  return runQueuedHistory(deps, deps.redoRemote);
}
