import type { ProcessSample } from '../types.js';
import type { WatchdogConfig } from './config.js';

export interface LeakAnalysis {
  pid: number;
  command: string;
  /** RSS growth rate from least-squares fit. */
  slopeKbPerMin: number;
  /** Fit quality 0–1. High = growth is steady, not noise. */
  r2: number;
  growthMb: number;
  sampleCount: number;
  isLeaking: boolean;
}

/**
 * Least-squares linear regression of RSS (KB) against time (minutes).
 * A leak shows up as a sustained positive slope with a good fit — noisy
 * caches that grow and shrink score a low r² and don't qualify.
 */
export function analyzeLeak(
  samples: ProcessSample[],
  cfg: WatchdogConfig['leak'],
): LeakAnalysis | null {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last || samples.length < 2) return null;

  const t0 = first.sampledAt;
  const xs = samples.map((s) => (s.sampledAt - t0) / 60_000); // minutes
  const ys = samples.map((s) => s.rssKb);

  const n = samples.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - meanX;
    const dy = (ys[i] as number) - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  // Zero time spread or perfectly flat memory — nothing to fit.
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);

  const growthMb = (last.rssKb - first.rssKb) / 1024;

  const isLeaking =
    n >= cfg.minSamples &&
    slope >= cfg.minSlopeKbPerMin &&
    r2 >= cfg.minR2 &&
    growthMb >= cfg.minGrowthMb;

  return {
    pid: last.pid,
    command: last.command,
    slopeKbPerMin: Math.round(slope),
    r2: Math.round(r2 * 1000) / 1000,
    growthMb: Math.round(growthMb * 10) / 10,
    sampleCount: n,
    isLeaking,
  };
}
