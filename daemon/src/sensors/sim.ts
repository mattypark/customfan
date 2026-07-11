import type { ThermalReading } from '../types.js';

/**
 * Simulated thermals with believable physics:
 * - CPU temp does a bounded random walk between 42–96 °C with occasional
 *   "load spike" episodes (compiling, game, runaway process).
 * - Fan RPM chases temperature with lag, like a real fan curve.
 */

const TEMP_MIN = 42;
const TEMP_MAX = 96;
const FAN_MIN_RPM = 1100;
const FAN_MAX_RPM = 6400;
const FAN_CHASE_RATE = 0.15; // how fast fan closes gap to its target per tick

let temp = 55;
let fanRpm = 1600;
let spikeTicksLeft = 0;

export function readSimThermals(): ThermalReading {
  // Occasionally enter a sustained load spike (~2% chance per tick).
  if (spikeTicksLeft <= 0 && Math.random() < 0.02) {
    spikeTicksLeft = 10 + Math.floor(Math.random() * 20);
  }

  const drift = (Math.random() - 0.5) * 2.2;
  const spikePush = spikeTicksLeft > 0 ? 1.8 : -0.6;
  spikeTicksLeft -= 1;

  temp = Math.min(TEMP_MAX, Math.max(TEMP_MIN, temp + drift + spikePush));

  // Fan curve: idle below 55°C, ramps linearly to max at 90°C.
  const heat = Math.min(1, Math.max(0, (temp - 55) / 35));
  const targetRpm = FAN_MIN_RPM + heat * (FAN_MAX_RPM - FAN_MIN_RPM);
  fanRpm += (targetRpm - fanRpm) * FAN_CHASE_RATE;

  return {
    cpuTempC: Math.round(temp * 10) / 10,
    fanRpm: Math.round(fanRpm),
    cpuSpeedLimit: temp > 92 ? 80 : 100,
    tempSource: 'sim',
    fanSource: 'sim',
    readAt: Date.now(),
  };
}
