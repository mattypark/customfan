import { describe, expect, test } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  evaluateAlerts,
  type AlertSample,
} from '../src/alerts/rules.js';

const T = DEFAULT_THRESHOLDS;
const T0 = 1_700_000_000_000;

/** Build a run of identical samples — the shape every rule needs to fire. */
function run(
  count: number,
  sample: Omit<AlertSample, 'at'>,
): AlertSample[] {
  return Array.from({ length: count }, (_, i) => ({
    ...sample,
    at: T0 + i * 2000,
  }));
}

const NOMINAL: Omit<AlertSample, 'at'> = {
  cpuTempC: 55,
  fanRpm: 2000,
  cpuSpeedLimit: 100,
  ventHottestC: 31,
};

/** CPU hot + fan working + exhaust cold — the blocked-airflow signature. */
const CLOGGED: Omit<AlertSample, 'at'> = {
  cpuTempC: 88,
  fanRpm: 5000,
  cpuSpeedLimit: 100,
  ventHottestC: 26, // only 3°C above the 23°C ambient — no heat coming out
};

function ids(samples: AlertSample[]): string[] {
  return evaluateAlerts(samples).map((a) => a.id);
}

describe('vent-clog — the rule the hardware exists for', () => {
  test('fires when CPU is hot, fan is working, and exhaust stays cold', () => {
    const alerts = evaluateAlerts(run(T.sustainedSamples, CLOGGED));
    const clog = alerts.find((a) => a.id === 'vent-clog');

    expect(clog).toBeDefined();
    expect(clog!.severity).toBe('critical');
    expect(clog!.since).toBe(T0);
  });

  test('does NOT fire when the exhaust is hot — cooling is working', () => {
    // Same hot CPU, same hard-working fan, but heat IS coming out. This is a
    // machine under load behaving correctly, and must stay silent.
    const healthy = { ...CLOGGED, ventHottestC: 44 };
    expect(ids(run(T.sustainedSamples, healthy))).not.toContain('vent-clog');
  });

  test('does NOT fire when the fan is idle — no airflow is expected yet', () => {
    const fanIdle = { ...CLOGGED, fanRpm: 1200 };
    expect(ids(run(T.sustainedSamples, fanIdle))).not.toContain('vent-clog');
  });

  test('does NOT fire when the CPU is cool — nothing to exhaust', () => {
    const cool = { ...CLOGGED, cpuTempC: 50 };
    expect(ids(run(T.sustainedSamples, cool))).not.toContain('vent-clog');
  });

  test('cannot fire without probe data — refuses to guess', () => {
    // Every software-visible signal screams "blocked", but with no Pi
    // reporting there is no evidence the exhaust is cold. Staying silent is
    // the honest answer.
    const noProbe = { ...CLOGGED, ventHottestC: null };
    expect(ids(run(T.sustainedSamples, noProbe))).not.toContain('vent-clog');
  });

  test('requires a sustained run, not a single spike', () => {
    const brief = run(T.sustainedSamples - 1, CLOGGED);
    expect(ids(brief)).not.toContain('vent-clog');
  });

  test('one healthy sample in the run breaks it', () => {
    const samples = run(T.sustainedSamples, CLOGGED);
    samples[2] = { ...samples[2]!, ventHottestC: 45 }; // exhaust briefly hot
    expect(ids(samples)).not.toContain('vent-clog');
  });
});

describe('fan-failure', () => {
  test('fires when the CPU is hot and the fan is stopped', () => {
    const dead = { ...NOMINAL, cpuTempC: 85, fanRpm: 0 };
    expect(ids(run(T.sustainedSamples, dead))).toContain('fan-failure');
  });

  test('stays silent when the fan is stopped but the CPU is cool', () => {
    const idle = { ...NOMINAL, cpuTempC: 45, fanRpm: 0 };
    expect(ids(run(T.sustainedSamples, idle))).not.toContain('fan-failure');
  });
});

describe('thermal-throttle', () => {
  test('fires on a sustained speed limit below 100%', () => {
    const throttled = { ...NOMINAL, cpuSpeedLimit: 70 };
    expect(ids(run(T.sustainedSamples, throttled))).toContain('thermal-throttle');
  });

  test('stays silent at 100%', () => {
    expect(ids(run(T.sustainedSamples, NOMINAL))).not.toContain('thermal-throttle');
  });

  test('stays silent when the speed limit is unknown', () => {
    const unknown = { ...NOMINAL, cpuSpeedLimit: null };
    expect(ids(run(T.sustainedSamples, unknown))).not.toContain('thermal-throttle');
  });
});

describe('sustained-max-fan', () => {
  test('needs a long run, not just the short sustained window', () => {
    const maxed = { ...NOMINAL, fanRpm: 6200 };

    expect(ids(run(T.sustainedSamples, maxed))).not.toContain('sustained-max-fan');
    expect(ids(run(T.maxFanSamples, maxed))).toContain('sustained-max-fan');
  });
});

describe('critical-temp', () => {
  test('fires above the danger threshold', () => {
    const critical = { ...NOMINAL, cpuTempC: 97 };
    expect(ids(run(T.sustainedSamples, critical))).toContain('critical-temp');
  });
});

describe('evaluateAlerts', () => {
  test('a nominal machine produces no alerts at all', () => {
    expect(evaluateAlerts(run(T.maxFanSamples, NOMINAL))).toEqual([]);
  });

  test('an empty history produces no alerts', () => {
    expect(evaluateAlerts([])).toEqual([]);
  });

  test('critical alerts sort ahead of warnings', () => {
    // Clogged vent (critical) AND throttling (warn) at once.
    const both = { ...CLOGGED, cpuSpeedLimit: 60 };
    const alerts = evaluateAlerts(run(T.sustainedSamples, both));

    expect(alerts.length).toBeGreaterThan(1);
    expect(alerts[0]!.severity).toBe('critical');
    expect(alerts[alerts.length - 1]!.severity).toBe('warn');
  });
});
