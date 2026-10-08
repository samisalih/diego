import { SEASONS, type Lighting } from "@app/core";

/**
 * Dev only: `&time=22` and `&season=winter` in the hash route override the document's lighting so
 * night and golden hour can be screenshotted. Folds to the identity in production builds.
 */
export function withDevLightingOverride(lighting: Lighting | undefined): Lighting | undefined {
  if (!import.meta.env.DEV || !lighting) return lighting;
  const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const time = Number(params.get("time"));
  const requestedSeason = params.get("season");
  const season = SEASONS.find((candidate) => candidate === requestedSeason);
  return {
    ...lighting,
    ...(params.has("time") && Number.isFinite(time) ? { time } : {}),
    ...(season ? { season } : {}),
  };
}
