const cache = new Map<string, string>();

/** The value of a design token (CSS custom property), so scene annotations use the same colours as the UI. */
export function tokenColor(name: `--${string}`): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  cache.set(name, value);
  return value;
}
