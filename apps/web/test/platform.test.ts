import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebPlatform } from "../src/platform/web";
import type { Platform } from "../src/platform/types";

const validEnv = {
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon-key",
  VITE_MCP_URL: "https://mcp.example.com",
  VITE_AUTH_REDIRECT_URL: "https://app.example.com/auth",
};

const win = window as unknown as Record<string, unknown>;

function makePlatform(): Platform {
  return createWebPlatform(validEnv);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete win.showSaveFilePicker;
  delete win.showOpenFilePicker;
});

describe("config", () => {
  // Red if a variable is mapped to the wrong config field.
  it("maps the four VITE_ variables to config fields", () => {
    expect(makePlatform().config).toEqual({
      supabaseUrl: validEnv.VITE_SUPABASE_URL,
      supabaseAnonKey: validEnv.VITE_SUPABASE_ANON_KEY,
      mcpUrl: validEnv.VITE_MCP_URL,
      authRedirectUrl: validEnv.VITE_AUTH_REDIRECT_URL,
    });
  });

  // Red if a missing variable is tolerated or the error does not name it.
  it.each(Object.keys(validEnv))("throws an error naming %s when it is missing", (name) => {
    const env: Record<string, string | undefined> = { ...validEnv, [name]: undefined };
    expect(() => createWebPlatform(env)).toThrow(name);
  });

  // Red if an empty string is accepted as a value.
  it("treats an empty value as missing", () => {
    expect(() => createWebPlatform({ ...validEnv, VITE_MCP_URL: "" })).toThrow("VITE_MCP_URL");
  });
});

describe("cache", () => {
  // Red if the prefix changes or values are not JSON-encoded.
  it("stores JSON under the apartment-planner: prefix", () => {
    makePlatform().cache.set("state", { a: [1, 2] });
    expect(localStorage.getItem("apartment-planner:state")).toBe(JSON.stringify({ a: [1, 2] }));
    expect(localStorage.getItem("state")).toBeNull();
  });

  // Red if the roundtrip loses structure.
  it("returns what was set", () => {
    const platform = makePlatform();
    platform.cache.set("k", { n: 1, list: ["x"] });
    expect(platform.cache.get<{ n: number; list: string[] }>("k")).toEqual({ n: 1, list: ["x"] });
  });

  // Red if a missing key returns undefined or throws.
  it("returns null for a missing key", () => {
    expect(makePlatform().cache.get("nope")).toBeNull();
  });

  // Red if corrupt JSON propagates a SyntaxError.
  it("returns null for corrupt JSON", () => {
    localStorage.setItem("apartment-planner:bad", "{not json");
    expect(makePlatform().cache.get("bad")).toBeNull();
  });

  // Red if remove ignores the prefix or does nothing.
  it("remove deletes the entry and leaves others", () => {
    const platform = makePlatform();
    platform.cache.set("a", 1);
    platform.cache.set("b", 2);
    platform.cache.remove("a");
    expect(platform.cache.get("a")).toBeNull();
    expect(platform.cache.get("b")).toBe(2);
  });

  // Red if a quota error escapes set.
  it("set does not throw when storage quota is exceeded", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => makePlatform().cache.set("k", "v")).not.toThrow();
  });

  // Red if unavailable storage (access throws) escapes set.
  it("set does not throw when localStorage is unavailable", () => {
    const unavailable = () => {
      throw new Error("unavailable");
    };
    vi.stubGlobal("localStorage", { getItem: unavailable, setItem: unavailable, removeItem: unavailable });
    expect(() => makePlatform().cache.set("k", "v")).not.toThrow();
  });
});

describe("clipboard", () => {
  // Red if writeText does not delegate to navigator.clipboard.
  it("writeText delegates to navigator.clipboard.writeText", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText, readText: vi.fn() } });
    await makePlatform().clipboard.writeText("hello");
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  // Red if readText does not return the clipboard value.
  it("readText returns navigator.clipboard.readText result", async () => {
    const readText = vi.fn().mockResolvedValue("pasted");
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(), readText } });
    await expect(makePlatform().clipboard.readText()).resolves.toBe("pasted");
  });
});

describe("window", () => {
  // Red if the title is not written to document.title.
  it("setTitle sets document.title", () => {
    makePlatform().window.setTitle("Plan A");
    expect(document.title).toBe("Plan A");
  });
});

describe("links", () => {
  // Red if the target or rel flags differ.
  it.each(["https://example.com/x", "http://example.com", "mailto:a@b.de"])(
    "opens %s with noopener,noreferrer in a new tab",
    (url) => {
      const open = vi.spyOn(window, "open").mockReturnValue(null);
      makePlatform().links.openExternal(url);
      expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer");
    },
  );

  // Red if the scheme allow-list is removed or widened.
  it.each(["javascript:alert(1)", "data:text/html,<b>x</b>", "file:///etc/passwd", "ftp://x.de", "not a url"])(
    "rejects %s without opening a window",
    (url) => {
      const open = vi.spyOn(window, "open").mockReturnValue(null);
      expect(() => makePlatform().links.openExternal(url)).toThrow();
      expect(open).not.toHaveBeenCalled();
    },
  );
});

describe("files.save", () => {
  // Red if the native picker is ignored when available.
  it("uses showSaveFilePicker and writes the data", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });
    win.showSaveFilePicker = showSaveFilePicker;

    await makePlatform().files.save({ suggestedName: "plan.json", data: "{}" });

    expect(showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "plan.json" }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  // Red if the fallback does not click a download link with the name, or never revokes the object URL.
  it("falls back to an <a download> click and revokes the object URL after a delay", async () => {
    vi.useFakeTimers();
    try {
      const createObjectURL = vi.fn().mockReturnValue("blob:fake-1");
      const revokeObjectURL = vi.fn();
      vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
      const clicked: HTMLAnchorElement[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this);
      });

      await makePlatform().files.save({ suggestedName: "plan.json", data: new Blob(["{}"]) });

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clicked).toHaveLength(1);
      expect(clicked[0]?.download).toBe("plan.json");
      expect(clicked[0]?.href).toBe("blob:fake-1");
      // Revoking synchronously can cancel the download in some browsers, so it must be deferred.
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-1");
    } finally {
      vi.useRealTimers();
    }
  });

  // Red if cancelling the native save dialog rejects instead of resolving.
  it("resolves without throwing when the native save picker is cancelled", async () => {
    win.showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    await expect(makePlatform().files.save({ suggestedName: "plan.json", data: "{}" })).resolves.toBeUndefined();
  });

  // Red if string data is not converted to a Blob for the fallback.
  it("fallback wraps string data in a Blob", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:fake-2");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await makePlatform().files.save({ suggestedName: "a.txt", data: "hello" });

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(await blob.text()).toBe("hello");
  });
});

describe("files.open", () => {
  function fakeFile(name: string, content: string, type = "text/plain"): File {
    return new File([content], name, { type });
  }

  // Red if handles are not turned into PickedFile objects.
  it("uses showOpenFilePicker and resolves PickedFile[]", async () => {
    const file = fakeFile("a.json", '{"x":1}', "application/json");
    const showOpenFilePicker = vi.fn().mockResolvedValue([{ getFile: () => Promise.resolve(file) }]);
    win.showOpenFilePicker = showOpenFilePicker;

    const result = await makePlatform().files.open({ accept: [".json"], multiple: true });

    expect(showOpenFilePicker).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("a.json");
    expect(result[0]?.type).toBe("application/json");
    expect(result[0]?.size).toBe(file.size);
    await expect(result[0]?.text()).resolves.toBe('{"x":1}');
    expect((await result[0]?.arrayBuffer())?.byteLength).toBe(file.size);
  });

  // Red if AbortError is rethrown.
  it("resolves [] when the native picker is cancelled", async () => {
    win.showOpenFilePicker = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    await expect(makePlatform().files.open({ accept: [".json"] })).resolves.toEqual([]);
  });

  // Red if non-abort errors are swallowed.
  it("rethrows errors that are not AbortError", async () => {
    win.showOpenFilePicker = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(makePlatform().files.open({ accept: [".json"] })).rejects.toThrow("boom");
  });

  // Red if the fallback input lacks accept/multiple or results are not mapped.
  it("falls back to a file input with accept and multiple set", async () => {
    const file1 = fakeFile("one.txt", "1");
    const file2 = fakeFile("two.txt", "22");
    let input: HTMLInputElement | undefined;
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      input = this;
      Object.defineProperty(this, "files", { value: [file1, file2], configurable: true });
      this.dispatchEvent(new Event("change"));
    });

    const result = await makePlatform().files.open({ accept: [".txt", "image/png"], multiple: true });

    expect(input?.type).toBe("file");
    expect(input?.multiple).toBe(true);
    expect(input?.accept).toBe(".txt,image/png");
    expect(result.map((f) => f.name)).toEqual(["one.txt", "two.txt"]);
    await expect(result[1]?.text()).resolves.toBe("22");
  });

  // Red if multiple defaults to true.
  it("fallback input is single-select by default", async () => {
    let input: HTMLInputElement | undefined;
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      input = this;
      Object.defineProperty(this, "files", { value: [], configurable: true });
      this.dispatchEvent(new Event("change"));
    });
    await makePlatform().files.open({ accept: [".txt"] });
    expect(input?.multiple).toBe(false);
  });
});
