// The few runtime globals core relies on. They exist in browsers, Deno and Node alike; declaring
// them here keeps the DOM lib out of core, so DOM APIs cannot slip in by accident.
declare var crypto: { getRandomValues<T extends ArrayBufferView>(array: T): T };
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare function structuredClone<T>(value: T): T;
