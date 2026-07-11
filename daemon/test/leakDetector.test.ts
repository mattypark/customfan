import { describe, expect, test } from 'vitest';
import { analyzeLeak } from '../src/watchdog/leakDetector.js';
import { DEFAULT_CONFIG } from '../src/watchdog/config.js';
import type { ProcessSample } from '../src/types.js';

const cfg = DEFAULT_CONFIG.leak;

function mkSamples(rssSeriesKb: number[], intervalMs = 5000): ProcessSample[] {
  const t0 = 1_700_000_000_000;
  return rssSeriesKb.map((rssKb, i) => ({
    pid: 4242,
    rssKb,
    cpuPercent: 5,
    etime: '01:00',
    stat: 'S',
    command: '/tmp/fake-app',
    sampledAt: t0 + i * intervalMs,
  }));
}

describe('analyzeLeak', () => {
  test('flags steady linear growth well above thresholds', () => {
    // 24 samples over ~2 min, growing 2 MB (2048 KB) per 5s tick
    // → slope ≈ 24.5 MB/min, growth ≈ 46 MB, r² ≈ 1.
    const series = Array.from({ length: 24 }, (_, i) => 100_000 + i * 2048);
    const result = analyzeLeak(mkSamples(series), cfg);

    expect(result).not.toBeNull();
    expect(result!.isLeaking).toBe(true);
    expect(result!.r2).toBeGreaterThan(0.99);
    expect(result!.slopeKbPerMin).toBeGreaterThan(cfg.minSlopeKbPerMin);
  });

  test('ignores flat memory', () => {
    const series = Array.from({ length: 30 }, () => 500_000);
    const result = analyzeLeak(mkSamples(series), cfg);

    expect(result).not.toBeNull();
    expect(result!.isLeaking).toBe(false);
  });

  test('ignores shrinking memory', () => {
    const series = Array.from({ length: 30 }, (_, i) => 800_000 - i * 4096);
    const result = analyzeLeak(mkSamples(series), cfg);

    expect(result!.isLeaking).toBe(false);
    expect(result!.slopeKbPerMin).toBeLessThan(0);
  });

  test('ignores noisy sawtooth (cache churn) via low r²', () => {
    // Oscillates hard around a baseline with slight upward drift — the drift
    // alone is nowhere near a leak signature.
    const series = Array.from(
      { length: 40 },
      (_, i) => 300_000 + (i % 2 === 0 ? 80_000 : -80_000) + i * 200,
    );
    const result = analyzeLeak(mkSamples(series), cfg);

    expect(result!.isLeaking).toBe(false);
    expect(result!.r2).toBeLessThan(cfg.minR2);
  });

  test('requires minimum history before judging', () => {
    // Steep growth but only 6 samples — too little evidence.
    const series = Array.from({ length: 6 }, (_, i) => 100_000 + i * 50_000);
    const result = analyzeLeak(mkSamples(series), cfg);

    expect(result!.isLeaking).toBe(false);
  });

  test('requires material absolute growth, not just slope', () => {
    // Perfect line but tiny process: grows 25 MB total < minGrowthMb=30
    // over a long window, slope also under 1 MB/min.
    const series = Array.from({ length: 60 }, (_, i) => 10_000 + i * 420);
    const result = analyzeLeak(mkSamples(series), cfg);

    expect(result!.isLeaking).toBe(false);
  });

  test('handles empty and single-sample input', () => {
    expect(analyzeLeak([], cfg)).toBeNull();
    expect(analyzeLeak(mkSamples([100_000]), cfg)).toBeNull();
  });
});
