import type { WatchdogConfig } from './config.js';
import { SYSTEM_CRITICAL, SYSTEM_PATH_PREFIXES } from './config.js';

export type Verdict = 'kill' | 'dry-run' | 'protected' | 'disabled';

export interface KillDecision {
  verdict: Verdict;
  reason: string;
}

/**
 * Pure decision function — given a suspect process and config, decide what
 * the watchdog is allowed to do. Safety rules always win over config.
 */
export function decideKill(
  pid: number,
  command: string,
  cfg: WatchdogConfig,
): KillDecision {
  // Absolute guards first — these ignore config entirely.
  if (pid <= 1) {
    return { verdict: 'protected', reason: 'pid <= 1 (kernel/launchd)' };
  }
  if (pid === process.pid) {
    return { verdict: 'protected', reason: 'customfan itself' };
  }

  const base = command.split('/').pop() ?? command;
  const critical = SYSTEM_CRITICAL.find(
    (name) => base.toLowerCase() === name.toLowerCase(),
  );
  if (critical) {
    return { verdict: 'protected', reason: `system-critical: ${critical}` };
  }

  const sysPrefix = SYSTEM_PATH_PREFIXES.find((p) => command.startsWith(p));
  if (sysPrefix) {
    return { verdict: 'protected', reason: `system path: ${sysPrefix}` };
  }

  const userProtected = cfg.protectedPatterns.find((pat) =>
    command.toLowerCase().includes(pat.toLowerCase()),
  );
  if (userProtected) {
    return {
      verdict: 'protected',
      reason: `user protectedPatterns: "${userProtected}"`,
    };
  }

  if (!cfg.killEnabled) {
    return { verdict: 'disabled', reason: 'killEnabled=false (log only)' };
  }
  if (cfg.dryRun) {
    return { verdict: 'dry-run', reason: 'dryRun=true (would kill)' };
  }

  return { verdict: 'kill', reason: 'no protection matched, enforcement on' };
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * SIGTERM first (lets the process exit cleanly), SIGKILL if it's still
 * alive after the grace period. Returns what actually happened.
 */
export async function executeKill(
  pid: number,
  graceSec: number,
): Promise<'sigterm' | 'sigkill' | 'already-dead' | 'failed'> {
  if (!isAlive(pid)) return 'already-dead';

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return 'failed';
  }

  await new Promise((r) => setTimeout(r, graceSec * 1000));
  if (!isAlive(pid)) return 'sigterm';

  try {
    process.kill(pid, 'SIGKILL');
    return 'sigkill';
  } catch {
    return 'failed';
  }
}
