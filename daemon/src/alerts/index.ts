import { RingBuffer } from '../sampler/ringBuffer.js';
import { getLatestThermals } from '../sensors/index.js';
import { getVentState } from '../sensors/vent.js';
import { logAction } from '../watchdog/actionLog.js';
import {
  DEFAULT_THRESHOLDS,
  evaluateAlerts,
  type Alert,
  type AlertId,
  type AlertSample,
} from './rules.js';

const SAMPLE_INTERVAL_MS = 2000;
/** ~4 min of fused history — enough for the longest rule (sustained max fan). */
const HISTORY_SAMPLES = 120;

const history = new RingBuffer<AlertSample>(HISTORY_SAMPLES);

let active: Alert[] = [];
/** Alerts already logged, so a standing condition doesn't spam the log. */
const announced = new Set<AlertId>();

function collect(): void {
  const thermals = getLatestThermals();
  const vent = getVentState();

  history.push({
    at: Date.now(),
    cpuTempC: thermals?.cpuTempC ?? null,
    fanRpm: thermals?.fanRpm ?? null,
    cpuSpeedLimit: thermals?.cpuSpeedLimit ?? null,
    // A stale agent contributes null, not its last value. The vent rules then
    // correctly decline to fire rather than reasoning from dead data.
    ventHottestC: vent.stale ? null : vent.hottestC,
  });

  const next = evaluateAlerts(history.toArray(), DEFAULT_THRESHOLDS);
  const nextIds = new Set(next.map((a) => a.id));

  for (const alert of next) {
    if (announced.has(alert.id)) continue;
    announced.add(alert.id);

    console.log(
      `[customfan] ALERT ${alert.severity.toUpperCase()} — ${alert.title}: ${alert.detail}`,
    );

    void logAction({
      at: alert.since,
      kind: 'frozen', // reuse the existing log stream; detail carries the rest
      pid: 0,
      command: `alert:${alert.id}`,
      verdict: alert.severity,
      reason: alert.title,
      detail: { message: alert.detail },
    });
  }

  // Clear the announce latch once a condition resolves, so a recurrence
  // announces again rather than being silently swallowed forever.
  for (const id of announced) {
    if (!nextIds.has(id)) {
      announced.delete(id);
      console.log(`[customfan] alert cleared — ${id}`);
    }
  }

  active = next;
}

export function startAlerts(): void {
  setInterval(collect, SAMPLE_INTERVAL_MS);
  console.log('[customfan] alert engine armed (vent-clog, fan-failure, throttle)');
}

export function activeAlerts(): Alert[] {
  return active;
}
