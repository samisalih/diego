import type { PickedFile, Platform } from "./types";

const CACHE_PREFIX = "apartment-planner:";
const ALLOWED_LINK_PROTOCOLS = ["http:", "https:", "mailto:"];
const REVOKE_OBJECT_URL_DELAY_MS = 1000;

// Minimal shapes of the File System Access API, which is not part of the DOM typings.
interface FileSystemWritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface FileHandleLike {
  createWritable(): Promise<FileSystemWritableLike>;
  getFile(): Promise<File>;
}
interface FilePickerWindow {
  showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileHandleLike>;
  showOpenFilePicker?: (options: {
    multiple: boolean;
    types: { accept: Record<string, string[]> }[];
  }) => Promise<FileHandleLike[]>;
}

function requireEnv(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function toPickedFile(file: File): PickedFile {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    text: () => file.text(),
    arrayBuffer: () => file.arrayBuffer(),
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function saveWithPicker(
  picker: NonNullable<FilePickerWindow["showSaveFilePicker"]>,
  suggestedName: string,
  blob: Blob,
): Promise<void> {
  try {
    const handle = await picker.call(window, { suggestedName });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    if (!isAbortError(error)) throw error;
  }
}

function saveWithDownloadLink(suggestedName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.click();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_OBJECT_URL_DELAY_MS);
}

async function saveFile(suggestedName: string, data: Blob | string): Promise<void> {
  const blob = typeof data === "string" ? new Blob([data]) : data;
  const picker = (window as FilePickerWindow).showSaveFilePicker;
  if (picker) return saveWithPicker(picker, suggestedName, blob);
  saveWithDownloadLink(suggestedName, blob);
}

// Picker types need MIME-type keys; extension-only entries go under a generic key.
function toPickerTypes(accept: string[]): { accept: Record<string, string[]> }[] {
  const extensions = accept.filter((entry) => entry.startsWith("."));
  const mimeTypes = accept.filter((entry) => !entry.startsWith("."));
  const types = mimeTypes.map((mimeType) => ({ accept: { [mimeType]: [] as string[] } }));
  if (extensions.length > 0) types.push({ accept: { "application/octet-stream": extensions } });
  return types;
}

async function openWithPicker(
  picker: NonNullable<FilePickerWindow["showOpenFilePicker"]>,
  accept: string[],
  multiple: boolean,
): Promise<PickedFile[]> {
  try {
    const handles = await picker.call(window, { multiple, types: toPickerTypes(accept) });
    const files = await Promise.all(handles.map((handle) => handle.getFile()));
    return files.map(toPickedFile);
  } catch (error) {
    if (isAbortError(error)) return [];
    throw error;
  }
}

function openWithInput(accept: string[], multiple: boolean): Promise<PickedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept.join(",");
    input.multiple = multiple;
    input.addEventListener("change", () => resolve(Array.from(input.files ?? []).map(toPickedFile)));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

function openFiles(options: { accept: string[]; multiple?: boolean }): Promise<PickedFile[]> {
  const multiple = options.multiple ?? false;
  const picker = (window as FilePickerWindow).showOpenFilePicker;
  return picker ? openWithPicker(picker, options.accept, multiple) : openWithInput(options.accept, multiple);
}

function openExternal(url: string): void {
  const protocol = new URL(url).protocol;
  if (!ALLOWED_LINK_PROTOCOLS.includes(protocol)) {
    throw new Error(`Blocked external link with protocol ${protocol}`);
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function createWebPlatform(env: Record<string, string | undefined>): Platform {
  const config = {
    supabaseUrl: requireEnv(env, "VITE_SUPABASE_URL"),
    supabaseAnonKey: requireEnv(env, "VITE_SUPABASE_ANON_KEY"),
    mcpUrl: requireEnv(env, "VITE_MCP_URL"),
    authRedirectUrl: requireEnv(env, "VITE_AUTH_REDIRECT_URL"),
  };

  return {
    config,
    files: {
      open: openFiles,
      save: ({ suggestedName, data }) => saveFile(suggestedName, data),
    },
    clipboard: {
      readText: () => navigator.clipboard.readText(),
      writeText: (text) => navigator.clipboard.writeText(text),
    },
    cache: {
      get<T>(key: string): T | null {
        try {
          const raw = localStorage.getItem(CACHE_PREFIX + key);
          return raw === null ? null : (JSON.parse(raw) as T);
        } catch {
          return null;
        }
      },
      set(key, value) {
        try {
          localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
        } catch {
          // Offline cache is best effort; quota or unavailable storage must not break the app.
        }
      },
      remove(key) {
        try {
          localStorage.removeItem(CACHE_PREFIX + key);
        } catch {
          // Same best-effort policy as set.
        }
      },
    },
    window: {
      setTitle: (title) => {
        document.title = title;
      },
    },
    links: { openExternal },
  };
}
