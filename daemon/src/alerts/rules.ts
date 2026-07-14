/**
 * Thermal alert rules.
 *
 * Pure functions over a history of samples. No I/O, no clock reads beyond
 * what's handed in — so every rule is unit-tested against a fabricated
 * history rather than by waiting for a Mac to actually overheat.
 *
 * The headline rule is `vent-clog`, and it is the reason the Raspberry Pi
 * exists. Software alone sees "CPU hot, fan at maximum" and concludes the
 * cooling system is doing its job. Only a physical probe in the exhaust can
 * reveal the truth: the fan is screaming, and *no hot air is coming out*.
 * That means the airflow path is blocked — dust, a blanket, a desk drawer —
 * and the machine is cooking itself while its own sensors report business as
 * usual.
 */

export type Severity = 'warn' | 'critical';

export type AlertId =
  | 'vent-clog'
  | 'fan-failure'
  | 'thermal-throttle'
  | 'sustained-max-fan'
  | 'critical-temp';

export interface Alert {
  id: AlertId;
  severity: Severity;
  title: string;
  detail: string;
  /** Timestamp of the oldest sample in the run that triggered this. */
  since: number;
}

/** One moment of fused state — everything the rules are allowed to see. */
export interface AlertSample {
  at: number;
  cpuTempC: number | null;
  fanRpm: number | null;
  cpuSpeedLimit: number | null;
  /** Hottest vent probe, or null when no Pi is reporting / data is stale. */
  ventHottestC: number | null;
}

export interface AlertThresholds {
  /** Above this, the CPU is working hard enough that exhaust should be warm. */
  hotCpuC: number;
  /** Absolute danger zone. */
  criticalCpuC: number;
  /** Fan RPM that counts as "working hard". */
  highFanRpm: number;
  /** Fan RPM at/above which we call it maxed. */
  maxFanRpm: number;
  /** Below this RPM with a hot CPU, the fan is not spinning. */
  deadFanRpm: number;
  /**
   * If the CPU is hot and the fan is high, the exhaust must be at least this
   * far above room temperature. If it isn't, air is not moving through it.
   */
  minVentRiseC: number;
  /** Assumed room temperature — vent rise is measured against this. */
  ambientC: number;
  /** Consecutive qualifying samples before a rule fires (anti-flap). */
  sustainedSamples: number;
  /** Longer run required before nagging about a maxed fan. */
  maxFanSamples: number;
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  hotCpuC: 75,
  criticalCpuC: 95,
  highFanRpm: 3800,
  maxFanRpm: 5800,
  deadFanRpm: 200,
  minVentRiseC: 8,
  ambientC: 23,
  sustainedSamples: 8, // ~16s at the 2s broadcast rate
  maxFanSamples: 60, // ~2 min of screaming before we mention it
};

/**
 * True when the last `count` samples all satisfy `predicate`. A single hot
 * sample means nothing — fans and temps spike constantly. Only a sustained
 * run is a real condition.
 */
function sustained(
  samples: AlertSample[],
  count: number,
  predicate: (s: AlertSample) => boolean,
): AlertSample[] | null {
  if (samples.length < count) return null;
  const run = samples.slice(-count);
  return run.every(predicate) ? run : null;
}

function since(run: AlertSample[]): number {
  return run[0]?.at ?? Date.now();
}

/**
 * The vent-clog rule.
 *
 * Fires when all three hold together, sustained:
 *   1. CPU is hot            — the machine is producing real heat
 *   2. Fan is working hard   — the cooling system believes it is exhausting it
 *   3. Exhaust is NOT hot    — but the heat isn't actually coming out
 *
 * Any two of these is normal. All three at once is physically contradictory
 * unless the airflow path is blocked. Requires live vent data — with no Pi
 * reporting, the rule cannot fire, and it says so rather than guessing.
 */
function checkVentClog(
  samples: AlertSample[],
  t: AlertThresholds,
): Alert | null {
  const run = sustained(samples, t.sustainedSamples, (s) => {
    if (s.cpuTempC === null || s.fanRpm === null) return false;
    if (s.ventHottestC === null) return false; // no probe = no verdict

    const cpuHot = s.cpuTempC >= t.hotCpuC;
    const fanWorking = s.fanRpm >= t.highFanRpm;
    const ventRise = s.ventHottestC - t.ambientC;
    const exhaustCold = ventRise < t.minVentRiseC;

    return cpuHot && fanWorking && exhaustCold;
  });

  if (!run) return null;

  const last = run[run.length - 1]!;
  const rise = (last.ventHottestC! - t.ambientC).toFixed(1);

  return {
    id: 'vent-clog',
    severity: 'critical',
    title: 'Exhaust vent appears blocked',
    detail:
      `CPU is at ${last.cpuTempC!.toFixed(1)}°C and the fan is at ` +
      `${last.fanRpm} RPM, but the exhaust is only ${rise}°C above room ` +
      `temperature. The fan is working and the heat is not coming out — ` +
      `airflow is obstructed. Check for dust, and make sure the vents are ` +
      `not against a soft surface.`,
    since: since(run),
  };
}

/** Hot CPU, fan not spinning. The fan has failed or is disconnected. */
function checkFanFailure(
  samples: AlertSample[],
  t: AlertThresholds,
): Alert | null {
  const run = sustained(samples, t.sustainedSamples, (s) => {
    if (s.cpuTempC === null || s.fanRpm === null) return false;
    return s.cpuTempC >= t.hotCpuC && s.fanRpm < t.deadFanRpm;
  });

  if (!run) return null;
  const last = run[run.length - 1]!;

  return {
    id: 'fan-failure',
    severity: 'critical',
    title: 'Fan not spinning under load',
    detail:
      `CPU is at ${last.cpuTempC!.toFixed(1)}°C but the fan reads ` +
      `${last.fanRpm} RPM. On a machine with active cooling this means the ` +
      `fan has failed. (On a fanless Mac, this alert is expected — set ` +
      `deadFanRpm to 0 in the config to silence it.)`,
    since: since(run),
  };
}

/** macOS is actively slowing the CPU down to survive. */
function checkThrottle(
  samples: AlertSample[],
  t: AlertThresholds,
): Alert | null {
  const run = sustained(samples, t.sustainedSamples, (s) => {
    return s.cpuSpeedLimit !== null && s.cpuSpeedLimit < 100;
  });

  if (!run) return null;
  const last = run[run.length - 1]!;

  return {
    id: 'thermal-throttle',
    severity: 'warn',
    title: 'CPU is being throttled',
    detail:
      `macOS has capped the CPU at ${last.cpuSpeedLimit}% to manage heat. ` +
      `You are paying for performance you are not getting.`,
    since: since(run),
  };
}

/** The fan has been at maximum for minutes. Loud, and a symptom of something. */
function checkSustainedMaxFan(
  samples: AlertSample[],
  t: AlertThresholds,
): Alert | null {
  const run = sustained(samples, t.maxFanSamples, (s) => {
    return s.fanRpm !== null && s.fanRpm >= t.maxFanRpm;
  });

  if (!run) return null;
  const minutes = Math.round((run.length * 2) / 60);

  return {
    id: 'sustained-max-fan',
    severity: 'warn',
    title: 'Fan pinned at maximum',
    detail:
      `The fan has been at full speed for about ${minutes} minute(s). ` +
      `Check the top processes — something is holding the machine at load.`,
    since: since(run),
  };
}

/** Simply too hot, regardless of why. */
function checkCriticalTemp(
  samples: AlertSample[],
  t: AlertThresholds,
): Alert | null {
  const run = sustained(samples, t.sustainedSamples, (s) => {
    return s.cpuTempC !== null && s.cpuTempC >= t.criticalCpuC;
  });

  if (!run) return null;
  const last = run[run.length - 1]!;

  return {
    id: 'critical-temp',
    severity: 'critical',
    title: 'CPU temperature is critical',
    detail:
      `Sustained ${last.cpuTempC!.toFixed(1)}°C — at or above the ` +
      `${t.criticalCpuC}°C danger threshold.`,
    since: since(run),
  };
}

/**
 * Evaluate every rule. Critical alerts sort first so the UI shows the worst
 * thing at the top without the caller having to know the severity order.
 */
export function evaluateAlerts(
  samples: AlertSample[],
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS,
): Alert[] {
  const alerts = [
    checkVentClog(samples, thresholds),
    checkFanFailure(samples, thresholds),
    checkCriticalTemp(samples, thresholds),
    checkThrottle(samples, thresholds),
    checkSustainedMaxFan(samples, thresholds),
  ].filter((a): a is Alert => a !== null);

  return alerts.sort((a, b) => {
    if (a.severity === b.severity) return a.since - b.since;
    return a.severity === 'critical' ? -1 : 1;
  });
}
