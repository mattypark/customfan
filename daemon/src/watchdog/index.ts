import { samplesFor, trackedPids } from '../sampler/processSampler.js';
import { logAction, warmActionLog } from './actionLog.js';
import { loadConfig, type WatchdogConfig } from './config.js';
import { analyzeFrozen } from './frozenDetector.js';
import { analyzeLeak, type LeakAnalysis } from './leakDetector.js';
import { decideKill, executeKill } from './killPolicy.js';

export interface WatchdogState {
  config: WatchdogConfig;
  leakSuspects: LeakAnalysis[];
  lastScanAt: number | null;
}

let config = loadConfig();
let leakSuspects: LeakAnalysis[] = [];
let lastScanAt: number | null = null;

/** pid → last alert timestamp, so one stuck process doesn't spam the log. */
const lastAlert = new Map<number, number>();

function cooledDown(pid: number): boolean {
  const prev = lastAlert.get(pid);
  return prev === undefined || Date.now() - prev > config.alertCooldownSec * 1000;
}

async function handleSuspect(
  kind: 'leak' | 'frozen',
  pid: number,
  command: string,
  detail: Record<string, unknown>,
): Promise<void> {
  if (!cooledDown(pid)) return;
  lastAlert.set(pid, Date.now());

  const decision = decideKill(pid, command, config);

  let outcome: string | undefined;
  if (decision.verdict === 'kill') {
    outcome = await executeKill(pid, config.sigkillGraceSec);
  }

  await logAction({
    at: Date.now(),
    kind,
    pid,
    command,
    verdict: decision.verdict,
    reason: decision.reason,
    detail,
    ...(outcome !== undefined && { outcome }),
  });

  console.log(
    `[customfan] ${kind} suspect pid=${pid} (${command.split('/').pop()}) ` +
      `→ ${decision.verdict}${outcome ? `/${outcome}` : ''}: ${decision.reason}`,
  );
}

async function scan(): Promise<void> {
  const suspects: LeakAnalysis[] = [];

  for (const pid of trackedPids()) {
    const samples = samplesFor(pid);

    const leak = analyzeLeak(samples, config.leak);
    if (leak?.isLeaking) {
      suspects.push(leak);
      await handleSuspect('leak', leak.pid, leak.command, {
        slopeKbPerMin: leak.slopeKbPerMin,
        r2: leak.r2,
        growthMb: leak.growthMb,
      });
    }

    const frozen = analyzeFrozen(samples, config.frozen);
    if (frozen) {
      await handleSuspect('frozen', frozen.pid, frozen.command, {
        reason: frozen.reason,
        evidence: frozen.evidence,
      });
    }
  }

  leakSuspects = suspects;
  lastScanAt = Date.now();
}

export function startWatchdog(): void {
  config = loadConfig();
  void warmActionLog();

  const intervalMs = config.scanIntervalSec * 1000;
  setInterval(() => void scan(), intervalMs);

  console.log(
    `[customfan] watchdog scanning every ${config.scanIntervalSec}s ` +
      `(killEnabled=${config.killEnabled}, dryRun=${config.dryRun})`,
  );
}

export function watchdogState(): WatchdogState {
  return { config, leakSuspects, lastScanAt };
}
