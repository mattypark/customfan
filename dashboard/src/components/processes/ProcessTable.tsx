import { AnimatePresence, motion } from 'framer-motion';
import { shortName, type LeakSuspect, type ProcessSummary } from '../../lib/types';
import './processes.css';

interface Props {
  processes: ProcessSummary[];
  leakSuspects: LeakSuspect[];
}

/** Bar fill is relative to the busiest row, so the table reads at a glance. */
function fill(value: number, max: number): string {
  return `${max === 0 ? 0 : Math.min(100, (value / max) * 100)}%`;
}

export function ProcessTable({ processes, leakSuspects }: Props) {
  const suspectPids = new Set(leakSuspects.filter((s) => s.isLeaking).map((s) => s.pid));
  const maxCpu = Math.max(1, ...processes.map((p) => p.cpuPercent));
  const maxMem = Math.max(1, ...processes.map((p) => p.rssMb));

  return (
    <div className="proc">
      <div className="proc__row proc__row--head">
        <span className="panel-label">process</span>
        <span className="panel-label proc__num">cpu</span>
        <span className="panel-label proc__num">memory</span>
      </div>

      <AnimatePresence initial={false}>
        {processes.map((p) => {
          const suspect = suspectPids.has(p.pid);
          return (
            <motion.div
              key={p.pid}
              layout
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className={`proc__row${suspect ? ' proc__row--suspect' : ''}`}
            >
              <span className="proc__name">
                {suspect && <span className="proc__flag" title="Leak suspect" />}
                <span className="proc__cmd">{shortName(p.command)}</span>
                <span className="proc__pid mono">{p.pid}</span>
              </span>

              <span className="proc__num mono">
                <span
                  className="proc__bar proc__bar--cpu"
                  style={{ width: fill(p.cpuPercent, maxCpu) }}
                />
                {p.cpuPercent.toFixed(1)}
              </span>

              <span className="proc__num mono">
                <span
                  className="proc__bar proc__bar--mem"
                  style={{ width: fill(p.rssMb, maxMem) }}
                />
                {p.rssMb >= 1024
                  ? `${(p.rssMb / 1024).toFixed(1)} GB`
                  : `${Math.round(p.rssMb)} MB`}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {processes.length === 0 && (
        <p className="proc__empty">Waiting for first sample…</p>
      )}
    </div>
  );
}
