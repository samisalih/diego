import { useRef } from "react";

/**
 * Returns the previous reference while the value is JSON-equal. Realtime updates re-parse whole rows,
 * so equal content arrives as new objects; this keeps unchanged geometry from being rebuilt.
 */
export function useDeepStable<T>(value: T): T {
  const ref = useRef<{ json: string; value: T }>(undefined);
  const json = JSON.stringify(value);
  if (ref.current?.json !== json) ref.current = { json, value };
  return ref.current.value;
}
