import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface WatchdogConfig {
  /** Master switch. false = detect + log only, never signal anything. */
  killEnabled: boolean;
  /** Even with killEnabled, dryRun logs the would-be kill instead of doing it. */
  dryRun: boolean;
  /** Seconds between watchdog scans. */
  scanIntervalSec: number;
  /** Seconds to wait after SIGTERM before escalating to SIGKILL. */
  sigkillGraceSec: number;
  /** Don't re-alert the same PID within this window. */
  alertCooldownSec: number;
  leak: {
    minSamples: number;
    minSlopeKbPerMin: number;
    minR2: number;
    minGrowthMb: number;
  };
  frozen: {
    /** Consecutive samples at ≥ cpuPinnedPercent to call it pinned. */
    cpuPinnedSamples: number;
    cpuPinnedPercent: number;
    /** Consecutive samples in uninterruptible (U) state to flag. */
    uninterruptibleSamples: number;
  };
  /** Substring matches (case-insensitive) that are NEVER killed. */
  protectedPatterns: string[];
}

export const DEFAULT_CONFIG: WatchdogConfig = {
  killEnabled: false,
  dryRun: true,
  scanIntervalSec: 30,
  sigkillGraceSec: 10,
  alertCooldownSec: 300,
  leak: {
    minSamples: 24, // 2 min of history at 5s sampling
    minSlopeKbPerMin: 1024, // growing ≥ 1 MB/min
    minR2: 0.6, // growth must be consistent, not noisy
    minGrowthMb: 30, // and material in absolute terms
  },
  frozen: {
    cpuPinnedSamples: 12, // ~1 min pegged
    cpuPinnedPercent: 97,
    uninterruptibleSamples: 12,
  },
  protectedPatterns: [],
};

/**
 * Processes the watchdog must never touch regardless of user config.
 * Killing any of these bricks the session or the OS.
 */
export const SYSTEM_CRITICAL = [
  'kernel_task',
  'launchd',
  'WindowServer',
  'loginwindow',
  'Finder',
  'SystemUIServer',
  'Dock',
  'coreaudiod',
  'watchdogd',
  'securityd',
  'opendirectoryd',
];

/** Path prefixes treated as system territory — protected by default. */
export const SYSTEM_PATH_PREFIXES = [
  '/System/',
  '/usr/libexec/',
  '/usr/sbin/',
  '/sbin/',
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', '..', 'customfan.config.json');

/** Load user config over defaults. Missing/broken file = safe defaults. */
export function loadConfig(): WatchdogConfig {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      leak: { ...DEFAULT_CONFIG.leak, ...raw.leak },
      frozen: { ...DEFAULT_CONFIG.frozen, ...raw.frozen },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
