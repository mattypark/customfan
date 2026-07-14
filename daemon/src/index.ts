import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { APP_NAME, APP_VERSION, DAEMON_PORT, SIM_MODE } from './config.js';
import { getLatestThermals, startThermalPolling } from './sensors/index.js';
import {
  startProcessSampling,
  topByCpu,
  topByMemory,
} from './sampler/processSampler.js';
import { startWatchdog, watchdogState } from './watchdog/index.js';
import { recentActions } from './watchdog/actionLog.js';
import { buildFrame, startBroadcasting } from './broadcast.js';
import { getVentState, ingestVentPost } from './sensors/vent.js';
import { activeAlerts, startAlerts } from './alerts/index.js';

const app = express();
app.use(express.json());

// Dashboard runs on its own Vite port in dev.
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

const startedAt = Date.now();

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    app: APP_NAME,
    version: APP_VERSION,
    sim: SIM_MODE,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    stage: 7,
  });
});

app.get('/api/stats', (_req, res) => {
  res.json({
    thermals: getLatestThermals(),
    vent: getVentState(),
    processes: {
      topByCpu: topByCpu(15),
      topByMemory: topByMemory(15),
    },
    generatedAt: Date.now(),
  });
});

/** The Raspberry Pi vent agent POSTs its probe readings here. */
app.post('/api/vent-temps', (req, res) => {
  const result = ingestVentPost(req.body);
  if (result === null) {
    res.status(400).json({ ok: false, error: 'no valid readings in payload' });
    return;
  }
  res.json({ ok: true, accepted: result.accepted });
});

app.get('/api/watchdog', (_req, res) => {
  res.json({
    ...watchdogState(),
    actions: recentActions(50),
  });
});

const server = createServer(app);

// WebSocket endpoint — dashboard connects here in Stage 4 for live stats.
export const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'hello', app: APP_NAME, sim: SIM_MODE }));
  // Send one frame immediately so the dashboard isn't blank until the next tick.
  socket.send(JSON.stringify(buildFrame()));
});

startThermalPolling();
startProcessSampling();
startWatchdog();
startAlerts();
startBroadcasting(wss);

server.listen(DAEMON_PORT, () => {
  console.log(
    `[${APP_NAME}] daemon up on http://localhost:${DAEMON_PORT} ` +
      `(sim=${SIM_MODE ? 'on' : 'off'})`,
  );
});
