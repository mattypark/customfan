/**
 * Browser-side demo feed.
 *
 * The real daemon cannot run on a static host — it reads Mac hardware, kills
 * processes, and holds a WebSocket. So the deployed build runs the simulation
 * *in the browser* and drives the exact same StatsFrame shape the daemon
 * broadcasts. Nothing else in the dashboard changes or knows the difference.
 *
 * The demo is a scripted 90-second story, not random noise, because a visitor
 * gives this page about thirty seconds and the whole point of the product is
 * one specific moment:
 *
 *   0-18s   nominal — a healthy machine, exhaust warm, everything quiet
 *   18-38s  load ramps — CPU climbs, fan spins up, exhaust follows it
 *   38-70s  THE VENT BLOCKS — exhaust goes cold while CPU and fan stay high.
 *           customfan raises the alert software alone cannot raise.
 *   70-90s  vent cleared — exhaust recovers, alert clears, machine settles
 *
 * Then it loops.
 */

import type { Alert, ProcessSummary, StatsFrame } from './types';

const AMBIENT_C = 23;
const CYCLE_MS = 90_000;

interface Phase {
  name: 'nominal' | 'load' | 'clogged' | 'clearing';
  cpuTempC: number;
  fanRpm: number;
  ventC: number;
  speedLimit: number;
}

/** Where we are in the story at time t (ms into the cycle). */
function phaseAt(t: number): Phase {
  if (t < 18_000) {
    return {
      name: 'nominal',
      cpuTempC: 52,
      fanRpm: 1800,
      ventC: AMBIENT_C + 9, // exhaust warm — heat is leaving the machine
      speedLimit: 100,
    };
  }

  if (t < 38_000) {
    // Load ramps in. A healthy machine: as the CPU heats, the fan spins up,
    // and the exhaust gets hot — because the air is actually moving.
    const p = (t - 18_000) / 20_000;
    return {
      name: 'load',
      cpuTempC: 52 + p * 36,
      fanRpm: 1800 + p * 3600,
      ventC: AMBIENT_C + 9 + p * 16,
      speedLimit: 100,
    };
  }

  if (t < 70_000) {
    // The vent blocks. CPU stays hot, fan stays loud — but the exhaust cools
    // toward ambient, because no air is getting through. This is the moment
    // the whole product exists for.
    const p = Math.min(1, (t - 38_000) / 8_000);
    return {
      name: 'clogged',
      cpuTempC: 88 + Math.sin(t / 900) * 1.6,
      fanRpm: 5400 + Math.sin(t / 1100) * 180,
      ventC: AMBIENT_C + 25 - p * 22, // 48°C → 26°C: heat stops coming out
      speedLimit: t > 56_000 ? 78 : 100, // macOS starts throttling to survive
    };
  }

  // Vent cleared: airflow returns, exhaust spikes as trapped heat escapes,
  // then everything settles back down.
  const p = (t - 70_000) / 20_000;
  return {
    name: 'clearing',
    cpuTempC: 88 - p * 34,
    fanRpm: 5400 - p * 3400,
    ventC: AMBIENT_C + 3 + Math.sin(p * Math.PI) * 22,
    speedLimit: 100,
  };
}

const BASE_PROCESSES: Array<Omit<ProcessSummary, 'cpuPercent' | 'rssMb'>> = [
  { pid: 1437, command: '/Applications/Chrome.app/Contents/MacOS/Chrome', sampleCount: 60 },
  { pid: 892, command: '/Applications/Xcode.app/Contents/MacOS/Xcode', sampleCount: 60 },
  { pid: 2104, command: '/usr/local/bin/node', sampleCount: 60 },
  { pid: 589, command: '/System/Library/PrivateFrameworks/SkyLight.framework/WindowServer', sampleCount: 60 },
  { pid: 1502, command: '/Applications/Slack.app/Contents/MacOS/Slack', sampleCount: 60 },
  { pid: 703, command: '/usr/libexec/mediaanalysisd', sampleCount: 60 },
];

/** The node process is the leaker — its memory climbs across the whole cycle. */
function processesAt(t: number, phase: Phase): ProcessSummary[] {
  const load = Math.min(1, Math.max(0, (phase.cpuTempC - 45) / 45));
  const leakMb = 180 + (t / CYCLE_MS) * 1400;

  return [
    { ...BASE_PROCESSES[0]!, cpuPercent: 22 + load * 70, rssMb: 1240 },
    { ...BASE_PROCESSES[1]!, cpuPercent: 14 + load * 52, rssMb: 2180 },
    { ...BASE_PROCESSES[2]!, cpuPercent: 8 + load * 12, rssMb: Math.round(leakMb) },
    { ...BASE_PROCESSES[3]!, cpuPercent: 6 + load * 9, rssMb: 310 },
    { ...BASE_PROCESSES[4]!, cpuPercent: 3, rssMb: 640 },
    { ...BASE_PROCESSES[5]!, cpuPercent: 2 + load * 5, rssMb: 95 },
  ].sort((a, b) => b.cpuPercent - a.cpuPercent);
}

function alertsAt(t: number, phase: Phase, cycleStart: number): Alert[] {
  const alerts: Alert[] = [];

  // Sustained-run requirement: the real rule needs ~16s of the condition
  // before it fires, so the demo respects the same delay.
  if (phase.name === 'clogged' && t > 46_000) {
    alerts.push({
      id: 'vent-clog',
      severity: 'critical',
      title: 'Exhaust vent appears blocked',
      detail:
        `CPU is at ${phase.cpuTempC.toFixed(1)}°C and the fan is at ` +
        `${Math.round(phase.fanRpm)} RPM, but the exhaust is only ` +
        `${(phase.ventC - AMBIENT_C).toFixed(1)}°C above room temperature. ` +
        `The fan is working and the heat is not coming out — airflow is ` +
        `obstructed. Check for dust, and make sure the vents are not against ` +
        `a soft surface.`,
      since: cycleStart + 46_000,
    });
  }

  if (phase.speedLimit < 100) {
    alerts.push({
      id: 'thermal-throttle',
      severity: 'warn',
      title: 'CPU is being throttled',
      detail:
        `macOS has capped the CPU at ${phase.speedLimit}% to manage heat. ` +
        `You are paying for performance you are not getting.`,
      since: cycleStart + 56_000,
    });
  }

  return alerts;
}

function actionsAt(t: number, cycleStart: number): StatsFrame['actions'] {
  const actions: StatsFrame['actions'] = [];

  if (t > 30_000) {
    actions.push({
      at: cycleStart + 30_000,
      kind: 'leak',
      pid: 2104,
      command: '/usr/local/bin/node',
      verdict: 'disabled',
      reason: 'killEnabled=false (log only)',
      detail: {
        slopeKbPerMin: 21_400,
        r2: 0.997,
        growthMb: Math.round((t / CYCLE_MS) * 1400),
      },
    });
  }

  if (t > 12_000) {
    actions.push({
      at: cycleStart + 12_000,
      kind: 'leak',
      pid: 703,
      command: '/usr/libexec/mediaanalysisd',
      verdict: 'protected',
      reason: 'system path: /System/',
      detail: { slopeKbPerMin: 3_180, r2: 0.81, growthMb: 42 },
    });
  }

  return actions.sort((a, b) => b.at - a.at);
}

export function buildDemoFrame(startedAt: number): StatsFrame {
  const now = Date.now();
  const elapsed = now - startedAt;
  const t = elapsed % CYCLE_MS;
  const cycleStart = now - t;

  const phase = phaseAt(t);
  const jitter = () => (Math.random() - 0.5) * 0.7;

  const cpuTempC = Math.round((phase.cpuTempC + jitter()) * 10) / 10;
  const ventC = Math.round((phase.ventC + jitter()) * 10) / 10;

  return {
    type: 'stats',
    thermals: {
      cpuTempC,
      fanRpm: Math.round(phase.fanRpm + jitter() * 40),
      cpuSpeedLimit: phase.speedLimit,
      tempSource: 'sim',
      fanSource: 'sim',
      readAt: now,
    },
    vent: {
      probes: [
        { probeId: 'demo-vent-0', tempC: ventC, source: 'sim', receivedAt: now },
        {
          probeId: 'demo-vent-1',
          tempC: Math.round((AMBIENT_C + (ventC - AMBIENT_C) * 0.72 + jitter()) * 10) / 10,
          source: 'sim',
          receivedAt: now,
        },
        {
          probeId: 'demo-vent-2',
          tempC: Math.round((AMBIENT_C + (ventC - AMBIENT_C) * 0.45 + jitter()) * 10) / 10,
          source: 'sim',
          receivedAt: now,
        },
      ],
      agentId: 'demo-pi',
      hottestC: ventC,
      lastSeenAt: now,
      stale: false,
    },
    alerts: alertsAt(t, phase, cycleStart),
    topByCpu: processesAt(t, phase),
    topByMemory: processesAt(t, phase),
    leakSuspects: [
      {
        pid: 2104,
        command: '/usr/local/bin/node',
        slopeKbPerMin: 21_400,
        r2: 0.997,
        growthMb: Math.round((t / CYCLE_MS) * 1400),
        sampleCount: 60,
        isLeaking: t > 30_000,
      },
    ],
    config: {
      killEnabled: false,
      dryRun: true,
      scanIntervalSec: 30,
      protectedPatterns: ['Claude', 'Terminal', 'iTerm'],
    },
    actions: actionsAt(t, cycleStart),
    at: now,
  };
}

/** Human-readable label for what the demo is currently showing. */
export function demoPhaseLabel(startedAt: number): string {
  const t = (Date.now() - startedAt) % CYCLE_MS;
  const phase = phaseAt(t);

  switch (phase.name) {
    case 'nominal':
      return 'healthy machine — exhaust is warm, heat is escaping';
    case 'load':
      return 'load ramping — fan spins up, exhaust heats with it';
    case 'clogged':
      return 'VENT BLOCKED — fan is roaring but no heat is coming out';
    case 'clearing':
      return 'vent cleared — trapped heat escapes, machine recovers';
  }
}
