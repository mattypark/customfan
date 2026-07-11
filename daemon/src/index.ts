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

const app = express();
app.use(express.json());

const startedAt = Date.now();

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    app: APP_NAME,
    version: APP_VERSION,
    sim: SIM_MODE,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    stage: 2,
  });
});

app.get('/api/stats', (_req, res) => {
  res.json({
    thermals: getLatestThermals(),
    processes: {
      topByCpu: topByCpu(15),
      topByMemory: topByMemory(15),
    },
    generatedAt: Date.now(),
  });
});

const server = createServer(app);

// WebSocket endpoint — dashboard connects here in Stage 4 for live stats.
export const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'hello', app: APP_NAME, sim: SIM_MODE }));
});

startThermalPolling();
startProcessSampling();

server.listen(DAEMON_PORT, () => {
  console.log(
    `[${APP_NAME}] daemon up on http://localhost:${DAEMON_PORT} ` +
      `(sim=${SIM_MODE ? 'on' : 'off'})`,
  );
});
