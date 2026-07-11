import { AnimatePresence, motion } from 'framer-motion';
import type { VentState } from '../../lib/types';
import './vent.css';

interface Props {
  vent: VentState | undefined;
  cpuTempC: number | null;
}

const PROBE_MIN_C = 20;
const PROBE_MAX_C = 60;

function probeTone(tempC: number): 'cool' | 'warm' | 'hot' {
  if (tempC >= 48) return 'hot';
  if (tempC >= 38) return 'warm';
  return 'cool';
}

function secondsAgo(ts: number | null): string {
  if (ts === null) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  return s < 2 ? 'now' : `${s}s ago`;
}

export function VentPanel({ vent, cpuTempC }: Props) {
  const offline = !vent || vent.stale || vent.probes.length === 0;

  return (
    <div className="vent">
      {offline ? (
        <div className="vent__offline">
          <span className="chip chip--mute">
            <span className="vent__led" />
            no agent
          </span>
          <p className="vent__offline-copy">
            No Raspberry Pi reporting. Run the agent to see exhaust temps:
          </p>
          <code className="vent__cmd mono">
            cd pi-agent && SIM=1 python3 agent.py
          </code>
          {vent?.lastSeenAt && (
            <p className="vent__offline-copy">
              Last reading {secondsAgo(vent.lastSeenAt)} — treating as stale.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="vent__head">
            <span className="chip chip--cool">
              <span className="vent__led vent__led--live" />
              {vent.agentId ?? 'pi agent'}
            </span>
            <span className="vent__seen mono">{secondsAgo(vent.lastSeenAt)}</span>
          </div>

          <div className="vent__probes">
            <AnimatePresence initial={false}>
              {vent.probes.map((probe) => {
                const tone = probeTone(probe.tempC);
                const pct =
                  ((Math.min(PROBE_MAX_C, Math.max(PROBE_MIN_C, probe.tempC)) -
                    PROBE_MIN_C) /
                    (PROBE_MAX_C - PROBE_MIN_C)) *
                  100;

                return (
                  <motion.div
                    key={probe.probeId}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`vent__probe vent__probe--${tone}`}
                  >
                    <span className="vent__probe-id mono" title={probe.probeId}>
                      {probe.probeId}
                    </span>

                    {/* Vertical thermometer column — reads like a real probe */}
                    <span className="vent__column">
                      <motion.span
                        className="vent__mercury"
                        animate={{ height: `${pct}%` }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </span>

                    <span className="vent__probe-temp mono">
                      {probe.tempC.toFixed(1)}
                      <span className="vent__probe-unit">°C</span>
                    </span>

                    <span className="vent__probe-src">{probe.source}</span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {cpuTempC !== null && vent.hottestC !== null && (
            <p className="vent__delta mono">
              exhaust runs{' '}
              <strong>{(cpuTempC - vent.hottestC).toFixed(1)}°C</strong> below
              the die
            </p>
          )}
        </>
      )}
    </div>
  );
}
