// Smoke test for the deploy pipeline: proves that @app/core (and its npm dependencies) run inside
// the Supabase edge runtime after bundling. Removed once the MCP function exists.
import { evaluateFormula, kelvinToRgb } from "@app/core";

Deno.serve(() => {
  const formula = evaluateFormula("width - 2 * armWidth", { width: 2, armWidth: 0.2 });
  return Response.json({ formula, warmWhite: kelvinToRgb(2700) });
});
