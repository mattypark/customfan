import { SIM_MODE } from '../config.js';
import type { ThermalReading } from '../types.js';
import { readMacThermals } from './mac.js';
import { readSimThermals } from './sim.js';

const POLL_INTERVAL_MS = 2000;

let latest: ThermalReading | null = null;

export function getLatestThermals(): ThermalReading | null {
  return latest;
}

async function poll(): Promise<void> {
  latest = SIM_MODE ? readSimThermals() : await readMacThermals();
}

export function startThermalPolling(): void {
  void poll();
  setInterval(() => void poll(), POLL_INTERVAL_MS);
  console.log(
    `[customfan] thermal polling every ${POLL_INTERVAL_MS}ms ` +
      `(mode=${SIM_MODE ? 'sim' : 'real-with-fallback'})`,
  );
}
