const MAX_SAMPLES = 1200;

export type FrameStats = { frames: number; medianMs: number; p95Ms: number };

function percentile(sortedValues: number[], share: number): number {
  return sortedValues[Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * share))] ?? 0;
}

/**
 * Dev only: records requestAnimationFrame intervals and exposes `window.__frameStats(lastN)` with the
 * median and p95 frame time plus the adaptive quality level, and `window.__frameStatsReset()`.
 */
export function installFrameStats(getLevelIndex: () => number): () => void {
  let samples: number[] = [];
  let previous = performance.now();
  let handle = requestAnimationFrame(function record(now) {
    samples.push(now - previous);
    if (samples.length > MAX_SAMPLES) samples.shift();
    previous = now;
    handle = requestAnimationFrame(record);
  });

  const target = window as unknown as Record<string, unknown>;
  target.__frameStats = (lastN = 600): FrameStats & { qualityLevel: number } => {
    const sorted = samples.slice(-lastN).sort((a, b) => a - b);
    return { frames: sorted.length, medianMs: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95), qualityLevel: getLevelIndex() };
  };
  target.__frameStatsReset = () => {
    samples = [];
  };

  return () => {
    cancelAnimationFrame(handle);
    delete target.__frameStats;
    delete target.__frameStatsReset;
  };
}
