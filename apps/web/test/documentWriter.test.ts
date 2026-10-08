import { SEED_ASSETS } from "../../../packages/core/src/seed/index.ts";
import { updateItems, type Asset, type DocumentContent } from "@app/core";
import { describe, expect, it, vi } from "vitest";
import { commitOperation, redo, undo } from "../src/data/documentWriter.ts";
import { documentFromRow, type PlannerDocument } from "../src/data/mappers.ts";
import { documentRow } from "./helpers/rows.ts";

// Contract: docs/specs/editor.md section 2.1. Interpretations made by the tests (the implementation follows them):
// - deps = { getDocument, getAssets, applyLocal, save, reload, undoRemote, redoRemote }
// - save(args) with args = { id: string; expectedVersion: number; content: DocumentContent }; it resolves with the new version
// - undoRemote / redoRemote({ id, expectedVersion }) resolve with the new version, or null when there is nothing to undo / redo
// - a version conflict is signalled like supabase-js reports a raised exception: the promise rejects with
//   { code: "P0409", message: "version_conflict" }; { message: "document_not_found" } means notFound;
//   any other rejection (e.g. TypeError "Failed to fetch") means a network error
// - undo(deps) / redo(deps) resolve with { ok: true; changed: boolean } or { ok: false; reason: "conflict" | "network" | "notFound"; message }
//   and refresh the local document by applyLocal(await reload()) after a successful remote call

const assets: Asset[] = SEED_ASSETS;
const VERSION = 7;

const conflictError = () => ({ code: "P0409", message: "version_conflict" });

function buildDocument(version = VERSION, overrides: Record<string, unknown> = {}): PlannerDocument {
  return documentFromRow(documentRow({ version, ...overrides }))!;
}

const sofaX = (doc: PlannerDocument | null) => doc?.items.find((item) => item.id === "item_sofa")?.x;
const lampX = (doc: PlannerDocument | null) => doc?.items.find((item) => item.id === "item_floor_lamp")?.x;

const moveSofa = (x: number) => (content: DocumentContent, available: Asset[]) =>
  updateItems(content, [{ id: "item_sofa", x }], available);
const moveLamp = (x: number) => (content: DocumentContent, available: Asset[]) =>
  updateItems(content, [{ id: "item_floor_lamp", x }], available);

type SaveArgs = { id: string; expectedVersion: number; content: DocumentContent };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Lets pending promise callbacks run; deterministic (no waiting for external events).
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function createHarness(options: {
  document?: PlannerDocument | null;
  save?: (args: SaveArgs) => Promise<number>;
  reload?: () => Promise<PlannerDocument | null>;
  undoRemote?: (args: { id: string; expectedVersion: number }) => Promise<number | null>;
  redoRemote?: (args: { id: string; expectedVersion: number }) => Promise<number | null>;
} = {}) {
  const state = { local: options.document === undefined ? buildDocument() : options.document };
  const server = buildDocument();
  const applied: PlannerDocument[] = [];
  const deps = {
    getDocument: () => state.local,
    getAssets: () => assets,
    applyLocal: vi.fn((doc: PlannerDocument) => {
      state.local = doc;
      applied.push(doc);
    }),
    save: vi.fn(options.save ?? (async (args: SaveArgs) => args.expectedVersion + 1)),
    reload: vi.fn(options.reload ?? (async () => server)),
    undoRemote: vi.fn(options.undoRemote ?? (async ({ expectedVersion }) => expectedVersion + 1)),
    redoRemote: vi.fn(options.redoRemote ?? (async ({ expectedVersion }) => expectedVersion + 1)),
  };
  return { deps, state, server, applied };
}

describe("commitOperation", () => {
  // Red if an invalid operation touches the local state or the database.
  it("returns the issues of an invalid operation without a local change and without a save", async () => {
    const { deps, state } = createHarness();
    const before = state.local;
    const result = await commitOperation(deps, (content, available) => updateItems(content, [{ id: "item_missing", x: 1 }], available));
    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== "invalid") throw new Error("expected reason invalid");
    expect(result.issues.length).toBeGreaterThan(0);
    expect(deps.applyLocal).not.toHaveBeenCalled();
    expect(deps.save).not.toHaveBeenCalled();
    expect(state.local).toBe(before);
  });

  // Red if the operation is not run on the current content or if it is handed the wrong assets.
  it("runs the operation on the current document content with the current assets", async () => {
    const { deps } = createHarness();
    const operation = vi.fn(moveSofa(3));
    await commitOperation(deps, operation);
    expect(operation).toHaveBeenCalledTimes(1);
    const [content, available] = operation.mock.calls[0]!;
    expect(content.items.find((item) => item.id === "item_sofa")!.x).toBe(2.3);
    expect(available).toBe(assets);
  });

  // Red if the local state waits for the server: while save is pending the new content is visible, the version is not bumped.
  it("applies the result locally at once with the old version, before save resolves", async () => {
    const pending = deferred<number>();
    const { deps, state } = createHarness({ save: () => pending.promise });
    const commit = commitOperation(deps, moveSofa(3));
    await flush();
    expect(deps.save).toHaveBeenCalledTimes(1);
    expect(sofaX(state.local)).toBe(3);
    expect(state.local!.version).toBe(VERSION);
    pending.resolve(VERSION + 1);
    await commit;
  });

  // Red if save gets the wrong id, expected version or content.
  it("saves the new content with the expected version and the document id", async () => {
    const { deps } = createHarness();
    await commitOperation(deps, moveSofa(3));
    const args = deps.save.mock.calls[0]![0];
    expect(args.id).toBe("doc_musterwohnung");
    expect(args.expectedVersion).toBe(VERSION);
    expect(args.content.items.find((item) => item.id === "item_sofa")!.x).toBe(3);
    expect(args.content.name).toBe("Musterwohnung");
    expect(args.content.apartment).toBeDefined();
    expect(args.content.lighting).toBeDefined();
  });

  // Red if the returned version is not applied (the next save would carry a stale expected version).
  it("applies the returned version locally and reports ok", async () => {
    const { deps, state } = createHarness({ save: async () => 42 });
    const result = await commitOperation(deps, moveSofa(3));
    expect(result).toEqual({ ok: true, version: 42 });
    expect(state.local!.version).toBe(42);
    expect(sofaX(state.local)).toBe(3);
  });

  describe("version conflict", () => {
    // Red if the same operation is not rerun on the freshly loaded content (the remote edit would be lost) or the retry keeps the old version.
    it("reloads, reruns the same operation on the fresh content and saves with the fresh version", async () => {
      const remote = buildDocument(9, { lighting: { ...buildDocument().lighting, time: 9 } });
      let attempts = 0;
      const { deps, state } = createHarness({
        save: async () => {
          attempts += 1;
          if (attempts === 1) throw conflictError();
          return 10;
        },
        reload: async () => remote,
      });
      const operation = vi.fn(moveSofa(3));
      const result = await commitOperation(deps, operation);
      expect(result).toEqual({ ok: true, version: 10 });
      expect(operation).toHaveBeenCalledTimes(2);
      expect(operation.mock.calls[1]![0].lighting.time).toBe(9);
      const retry = deps.save.mock.calls[1]![0];
      expect(retry.expectedVersion).toBe(9);
      expect(retry.content.lighting.time).toBe(9);
      expect(retry.content.items.find((item) => item.id === "item_sofa")!.x).toBe(3);
      expect(state.local!.version).toBe(10);
      expect(state.local!.lighting.time).toBe(9);
      expect(sofaX(state.local)).toBe(3);
    });

    // Red if the retry loop is unbounded or stops early: exactly 3 save attempts, then "conflict".
    it("gives up with conflict after 3 attempts and restores the reloaded document locally", async () => {
      let reloads = 0;
      const reloaded: PlannerDocument[] = [];
      const { deps, state } = createHarness({
        save: async () => {
          throw conflictError();
        },
        reload: async () => {
          reloads += 1;
          const doc = buildDocument(VERSION + reloads, { lighting: { ...buildDocument().lighting, time: reloads } });
          reloaded.push(doc);
          return doc;
        },
      });
      const result = await commitOperation(deps, moveSofa(3));
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.reason).toBe("conflict");
      expect(typeof (result as { message: string }).message).toBe("string");
      expect(deps.save).toHaveBeenCalledTimes(3);
      expect(state.local).toEqual(reloaded.at(-1));
      expect(sofaX(state.local)).toBe(2.3);
    });

    // Red if a rerun that turns invalid on the fresh content (item deleted remotely) is still saved.
    it("returns invalid when the rerun fails on the fresh content", async () => {
      const remote = buildDocument(9, { items: buildDocument().items.filter((item) => item.id !== "item_sofa") });
      const { deps } = createHarness({
        save: async () => {
          throw conflictError();
        },
        reload: async () => remote,
      });
      const result = await commitOperation(deps, moveSofa(3));
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.reason).toBe("invalid");
      expect(deps.save).toHaveBeenCalledTimes(1);
    });
  });

  describe("failures", () => {
    // Red if a network error leaves the optimistic content in the local state or is reported as a conflict.
    it("returns network and restores the last server state locally", async () => {
      const { deps, state, server } = createHarness({
        save: async () => {
          throw new TypeError("Failed to fetch");
        },
      });
      const result = await commitOperation(deps, moveSofa(3));
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.reason).toBe("network");
      expect(typeof (result as { message: string }).message).toBe("string");
      expect(deps.save).toHaveBeenCalledTimes(1);
      expect(state.local).toEqual(server);
      expect(sofaX(state.local)).toBe(2.3);
    });

    // Red if a missing document is reported as a network error.
    it("returns notFound when the database reports document_not_found", async () => {
      const { deps } = createHarness({
        save: async () => {
          throw { code: "P0001", message: "document_not_found" };
        },
      });
      const result = await commitOperation(deps, moveSofa(3));
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.reason).toBe("notFound");
    });

    // Red if commit runs without a loaded document.
    it("returns notFound without a loaded document and does not save", async () => {
      const { deps } = createHarness({ document: null });
      const result = await commitOperation(deps, moveSofa(3));
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.reason).toBe("notFound");
      expect(deps.save).not.toHaveBeenCalled();
    });
  });

  describe("serialised queue", () => {
    // Red if two commits run concurrently, if the second ignores the version/content of the first, or if the order changes.
    it("makes the second commit wait for the first and build on its result", async () => {
      const first = deferred<number>();
      const savedOrder: Array<{ expectedVersion: number; sofa: number; lamp: number }> = [];
      const { deps, state } = createHarness({
        save: (args) => {
          const find = (id: string) => args.content.items.find((item) => item.id === id)!.x;
          savedOrder.push({ expectedVersion: args.expectedVersion, sofa: find("item_sofa"), lamp: find("item_floor_lamp") });
          return savedOrder.length === 1 ? first.promise : Promise.resolve(args.expectedVersion + 1);
        },
      });
      const commitOne = commitOperation(deps, moveSofa(3));
      const commitTwo = commitOperation(deps, moveLamp(1.5));
      await flush();
      expect(deps.save).toHaveBeenCalledTimes(1);
      first.resolve(VERSION + 1);
      const [resultOne, resultTwo] = await Promise.all([commitOne, commitTwo]);
      expect(resultOne).toEqual({ ok: true, version: VERSION + 1 });
      expect(resultTwo).toEqual({ ok: true, version: VERSION + 2 });
      expect(savedOrder).toEqual([
        { expectedVersion: VERSION, sofa: 3, lamp: 0.8 },
        { expectedVersion: VERSION + 1, sofa: 3, lamp: 1.5 },
      ]);
      expect(sofaX(state.local)).toBe(3);
      expect(lampX(state.local)).toBe(1.5);
    });

    // Red if a failed commit blocks the queue for everything behind it.
    it("keeps processing after a failed commit", async () => {
      let calls = 0;
      const { deps } = createHarness({
        save: async (args) => {
          calls += 1;
          if (calls === 1) throw new TypeError("Failed to fetch");
          return args.expectedVersion + 1;
        },
      });
      const failing = commitOperation(deps, moveSofa(3));
      const following = commitOperation(deps, moveLamp(1.5));
      expect((await failing).ok).toBe(false);
      expect((await following).ok).toBe(true);
      expect(deps.save).toHaveBeenCalledTimes(2);
    });
  });
});

describe.each([
  { name: "undo", run: undo, remote: "undoRemote" as const },
  { name: "redo", run: redo, remote: "redoRemote" as const },
])("$name", ({ run, remote }) => {
  // Red if the rpc is called without the current version, or if the local document is not refreshed afterwards.
  it("calls the database with the expected version and applies the reloaded document", async () => {
    const reloaded = buildDocument(8, { items: buildDocument().items.map((item) => (item.id === "item_sofa" ? { ...item, x: 1.1 } : item)) });
    const { deps, state } = createHarness({ reload: async () => reloaded });
    const result = await run(deps);
    expect(result).toEqual({ ok: true, changed: true });
    expect(deps[remote]).toHaveBeenCalledWith({ id: "doc_musterwohnung", expectedVersion: VERSION });
    expect(state.local).toEqual(reloaded);
    expect(deps.save).not.toHaveBeenCalled();
  });

  // Red if "nothing to do" is reported as a change or as an error.
  it("reports changed=false when the database has nothing to do and keeps the local document", async () => {
    const { deps, state } = createHarness({ [remote]: async () => null });
    const before = state.local;
    expect(await run(deps)).toEqual({ ok: true, changed: false });
    expect(state.local).toBe(before);
  });

  // Red if a conflict is not retried with the reloaded version, or retried more than once.
  it("reloads and retries once on a version conflict", async () => {
    const remote9 = buildDocument(9);
    let calls = 0;
    const { deps, state } = createHarness({
      [remote]: async ({ expectedVersion }: { expectedVersion: number }) => {
        calls += 1;
        if (calls === 1) throw conflictError();
        return expectedVersion + 1;
      },
      reload: async () => remote9,
    });
    const result = await run(deps);
    expect(result).toEqual({ ok: true, changed: true });
    expect(deps[remote]).toHaveBeenCalledTimes(2);
    expect(deps[remote]).toHaveBeenNthCalledWith(1, { id: "doc_musterwohnung", expectedVersion: VERSION });
    expect(deps[remote]).toHaveBeenNthCalledWith(2, { id: "doc_musterwohnung", expectedVersion: 9 });
    expect(state.local).toBeDefined();
  });

  // Red if the retry is unbounded: a second conflict ends with reason conflict after exactly two calls.
  it("returns conflict after the second conflict", async () => {
    const { deps } = createHarness({
      [remote]: async () => {
        throw conflictError();
      },
      reload: async () => buildDocument(9),
    });
    const result = await run(deps);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("conflict");
    expect(deps[remote]).toHaveBeenCalledTimes(2);
  });

  // Red if a network error is swallowed or mislabelled.
  it("returns network when the rpc fails", async () => {
    const { deps } = createHarness({
      [remote]: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const result = await run(deps);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("network");
  });

  // Red if history commands run without a loaded document.
  it("returns notFound without a loaded document", async () => {
    const { deps } = createHarness({ document: null });
    const result = await run(deps);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("notFound");
    expect(deps[remote]).not.toHaveBeenCalled();
  });
});
