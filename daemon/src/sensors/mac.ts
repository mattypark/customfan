import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ThermalReading, ThermalSource } from '../types.js';
import { readSimThermals } from './sim.js';

const execFileP = promisify(execFile);
const EXEC_TIMEOUT_MS = 2500;

async function run(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileP(cmd, args, { timeout: EXEC_TIMEOUT_MS });
    return stdout;
  } catch {
    return null;
  }
}

/** `smctemp -c` → "61.8" (brew install smctemp; best source on Apple Silicon). */
async function readSmctemp(): Promise<number | null> {
  const out = await run('smctemp', ['-c']);
  if (out === null) return null;
  const v = Number.parseFloat(out.trim());
  return Number.isFinite(v) && v > 0 && v < 130 ? v : null;
}

/** `osx-cpu-temp -c` → "61.8°C" (Intel-era tool, still works on some setups). */
async function readOsxCpuTemp(): Promise<number | null> {
  const out = await run('osx-cpu-temp', ['-c']);
  if (out === null) return null;
  const v = Number.parseFloat(out);
  return Number.isFinite(v) && v > 0 && v < 130 ? v : null;
}

/** `osx-cpu-temp -f` → "Fan 0 - 1200 RPM" per fan; average across fans. */
async function readOsxFanRpm(): Promise<number | null> {
  const out = await run('osx-cpu-temp', ['-f']);
  if (out === null) return null;
  const rpms = [...out.matchAll(/(\d+)\s*RPM/gi)].map((m) => Number(m[1]));
  if (rpms.length === 0) return null;
  return Math.round(rpms.reduce((a, b) => a + b, 0) / rpms.length);
}

/**
 * Battery temperature from ioreg — value is in centi-degrees C (3119 = 31.19°C).
 * Coarse proxy for system heat, but real, sudo-free, and present on every
 * MacBook. Tagged 'battery-proxy' so the UI never pretends it's die temp.
 */
async function readBatteryTemp(): Promise<number | null> {
  const out = await run('ioreg', ['-rn', 'AppleSmartBattery']);
  if (out === null) return null;
  const m = out.match(/"Temperature"\s*=\s*(\d+)/);
  if (!m) return null;
  const v = Number(m[1]) / 100;
  return Number.isFinite(v) && v > 5 && v < 90 ? v : null;
}

/** `pmset -g therm` → CPU_Speed_Limit (100 = not throttling). */
async function readCpuSpeedLimit(): Promise<number | null> {
  const out = await run('pmset', ['-g', 'therm']);
  if (out === null) return null;
  const m = out.match(/CPU_Speed_Limit\s*=\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Real-hardware read with honest fallbacks. Any gap (e.g. fan RPM without an
 * SMC tool installed) is filled from the simulator and tagged 'sim'.
 */
export async function readMacThermals(): Promise<ThermalReading> {
  const [smc, osx, battery, speedLimit, osxFan] = await Promise.all([
    readSmctemp(),
    readOsxCpuTemp(),
    readBatteryTemp(),
    readCpuSpeedLimit(),
    readOsxFanRpm(),
  ]);

  let cpuTempC: number | null = null;
  let tempSource: ThermalSource = 'sim';
  if (smc !== null) {
    cpuTempC = smc;
    tempSource = 'smctemp';
  } else if (osx !== null) {
    cpuTempC = osx;
    tempSource = 'osx-cpu-temp';
  } else if (battery !== null) {
    cpuTempC = battery;
    tempSource = 'battery-proxy';
  }

  const sim = readSimThermals();

  return {
    cpuTempC: cpuTempC ?? sim.cpuTempC,
    fanRpm: osxFan ?? sim.fanRpm,
    cpuSpeedLimit: speedLimit ?? (cpuTempC === null ? sim.cpuSpeedLimit : null),
    tempSource: cpuTempC !== null ? tempSource : 'sim',
    fanSource: osxFan !== null ? 'osx-cpu-temp' : 'sim',
    readAt: Date.now(),
  };
}
