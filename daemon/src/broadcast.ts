import type { WebSocketServer } from 'ws';
import { getLatestThermals } from './sensors/index.js';
import { topByCpu, topByMemory } from './sampler/processSampler.js';
import { watchdogState } from './watchdog/index.js';
import { recentActions } from './watchdog/actionLog.js';
import { getVentState } from './sensors/vent.js';

const BROADCAST_INTERVAL_MS = 2000;

export interface StatsFrame {
  type: 'stats';
  thermals: ReturnType<typeof getLatestThermals>;
  vent: ReturnType<typeof getVentState>;
  topByCpu: ReturnType<typeof topByCpu>;
  topByMemory: ReturnType<typeof topByMemory>;
  leakSuspects: ReturnType<typeof watchdogState>['leakSuspects'];
  config: ReturnType<typeof watchdogState>['config'];
  actions: ReturnType<typeof recentActions>;
  at: number;
}

export function buildFrame(): StatsFrame {
  const wd = watchdogState();
  return {
    type: 'stats',
    thermals: getLatestThermals(),
    vent: getVentState(),
    topByCpu: topByCpu(12),
    topByMemory: topByMemory(12),
    leakSuspects: wd.leakSuspects,
    config: wd.config,
    actions: recentActions(30),
    at: Date.now(),
  };
}

export function startBroadcasting(wss: WebSocketServer): void {
  setInterval(() => {
    if (wss.clients.size === 0) return;
    const payload = JSON.stringify(buildFrame());
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  }, BROADCAST_INTERVAL_MS);

  console.log(`[customfan] websocket broadcast every ${BROADCAST_INTERVAL_MS}ms`);
}
