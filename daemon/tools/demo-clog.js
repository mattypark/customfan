/**
 * Demo: stage a blocked exhaust vent and watch customfan diagnose it.
 *
 * Impersonates a Pi agent reporting a vent that stays cold while the CPU runs
 * hot and the fan runs hard. That three-way contradiction is impossible unless
 * airflow is obstructed — and it is the one diagnosis a software-only monitor
 * cannot make, because software has no way to know the exhaust is cold.
 *
 * Run the daemon in a mode where it reports a hot CPU and a working fan:
 *
 *   cd daemon && SIM=1 SIM_HOT=1 npm run dev
 *   node tools/demo-clog.js
 *
 * Then watch the dashboard: the vent-clog alert appears within ~20 seconds.
 */

const DAEMON = process.env.DAEMON_URL ?? 'http://localhost:4310';
const POST_INTERVAL_MS = 2000;

// A vent that is barely above room temperature (23 °C) while the machine
// cooks. Real exhaust under this kind of load would read 45 °C or more.
const COLD_VENT_C = 25.5;

let ticks = 0;

async function report() {
  ticks += 1;

  const readings = [
    { probeId: 'demo-probe-0', tempC: COLD_VENT_C, source: 'sim' },
    { probeId: 'demo-probe-1', tempC: COLD_VENT_C - 1.2, source: 'sim' },
  ];

  try {
    const res = await fetch(`${DAEMON}/api/vent-temps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'demo-clogged-vent', readings }),
    });

    if (!res.ok) {
      console.error(`[demo] daemon rejected the post: ${res.status}`);
      return;
    }

    if (ticks === 1) {
      console.log(`[demo] reporting a cold exhaust (${COLD_VENT_C}°C) to ${DAEMON}`);
      console.log('[demo] the daemon needs a sustained run before it will call it —');
      console.log('[demo] watch for the vent-clog alert in ~20s.');
    }
  } catch (err) {
    console.error(`[demo] cannot reach the daemon at ${DAEMON}. Is it running?`);
  }
}

setInterval(report, POST_INTERVAL_MS);
report();
