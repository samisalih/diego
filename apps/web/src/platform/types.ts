export interface PickedFile {
  name: string;
  type: string;
  size: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface Platform {
  files: {
    open(options: { accept: string[]; multiple?: boolean }): Promise<PickedFile[]>;
    save(options: { suggestedName: string; data: Blob | string }): Promise<void>;
  };
  clipboard: { readText(): Promise<string>; writeText(text: string): Promise<void> };
  cache: { get<T>(key: string): T | null; set(key: string, value: unknown): void; remove(key: string): void };
  window: { setTitle(title: string): void };
  links: { openExternal(url: string): void };
  config: { supabaseUrl: string; supabaseAnonKey: string; mcpUrl: string; authRedirectUrl: string };
}
