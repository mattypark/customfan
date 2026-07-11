import type { ProcessSample } from '../types.js';
import type { WatchdogConfig } from './config.js';

export type FrozenReason =
  | 'zombie'
  | 'stopped'
  | 'uninterruptible'
  | 'cpu-pinned';

export interface FrozenAnalysis {
  pid: number;
  command: string;
  reason: FrozenReason;
  evidence: string;
}

/**
 * Classify a process as frozen/stuck from its recent sample history.
 * Returns null for healthy processes.
 */
export function analyzeFrozen(
  samples: ProcessSample[],
  cfg: WatchdogConfig['frozen'],
): FrozenAnalysis | null {
  const last = samples[samples.length - 1];
  if (!last) return null;

  const state = last.stat.charAt(0);

  if (state === 'Z') {
    return {
      pid: last.pid,
      command: last.command,
      reason: 'zombie',
      evidence: `stat=${last.stat}`,
    };
  }

  if (state === 'T') {
    return {
      pid: last.pid,
      command: last.command,
      reason: 'stopped',
      evidence: `stat=${last.stat}`,
    };
  }

  // Sustained uninterruptible wait — classic hung-on-I/O signature.
  if (samples.length >= cfg.uninterruptibleSamples) {
    const tail = samples.slice(-cfg.uninterruptibleSamples);
    if (tail.every((s) => s.stat.startsWith('U'))) {
      return {
        pid: last.pid,
        command: last.command,
        reason: 'uninterruptible',
        evidence: `stat=U for ${tail.length} consecutive samples`,
      };
    }
  }

  // CPU pegged at ~100% continuously — busy-loop / runaway signature.
  if (samples.length >= cfg.cpuPinnedSamples) {
    const tail = samples.slice(-cfg.cpuPinnedSamples);
    if (tail.every((s) => s.cpuPercent >= cfg.cpuPinnedPercent)) {
      return {
        pid: last.pid,
        command: last.command,
        reason: 'cpu-pinned',
        evidence:
          `cpu ≥ ${cfg.cpuPinnedPercent}% for ${tail.length} samples ` +
          `(latest ${last.cpuPercent}%)`,
      };
    }
  }

  return null;
}
