export type ThermalSource =
  | 'smctemp'
  | 'osx-cpu-temp'
  | 'battery-proxy'
  | 'sim';

export interface Thermals {
  cpuTempC: number | null;
  fanRpm: number | null;
  cpuSpeedLimit: number | null;
  tempSource: ThermalSource;
  fanSource: ThermalSource;
  readAt: number;
}

export interface ProcessSummary {
  pid: number;
  command: string;
  cpuPercent: number;
  rssMb: number;
  sampleCount: number;
}

export interface LeakSuspect {
  pid: number;
  command: string;
  slopeKbPerMin: number;
  r2: number;
  growthMb: number;
  sampleCount: number;
  isLeaking: boolean;
}

export interface ActionEntry {
  at: number;
  kind: 'leak' | 'frozen';
  pid: number;
  command: string;
  verdict: string;
  reason: string;
  detail: Record<string, unknown>;
  outcome?: string;
}

export interface WatchdogConfigView {
  killEnabled: boolean;
  dryRun: boolean;
  scanIntervalSec: number;
  protectedPatterns: string[];
}

export interface VentProbe {
  probeId: string;
  tempC: number;
  source: string;
  receivedAt: number;
}

export interface VentState {
  probes: VentProbe[];
  agentId: string | null;
  hottestC: number | null;
  lastSeenAt: number | null;
  stale: boolean;
}

export interface StatsFrame {
  type: 'stats';
  thermals: Thermals | null;
  vent: VentState;
  topByCpu: ProcessSummary[];
  topByMemory: ProcessSummary[];
  leakSuspects: LeakSuspect[];
  config: WatchdogConfigView;
  actions: ActionEntry[];
  at: number;
}

export type ThermalState = 'cool' | 'warm' | 'hot';

/** Single source of truth for what a temperature *means*. */
export function thermalState(tempC: number | null): ThermalState {
  if (tempC === null) return 'cool';
  if (tempC >= 85) return 'hot';
  if (tempC >= 70) return 'warm';
  return 'cool';
}

/** Trim absolute binary paths down to what a human reads. */
export function shortName(command: string): string {
  const appMatch = command.match(/\/([^/]+)\.app\//);
  if (appMatch) return appMatch[1];
  return command.split('/').pop() ?? command;
}
