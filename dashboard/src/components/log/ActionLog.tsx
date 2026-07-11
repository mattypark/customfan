import { AnimatePresence, motion } from 'framer-motion';
import { shortName, type ActionEntry } from '../../lib/types';
import './log.css';

interface Props {
  actions: ActionEntry[];
}

/** Verdict → chip tone. Protected/disabled are calm; a real kill is loud. */
const VERDICT_TONE: Record<string, string> = {
  kill: 'hot',
  'dry-run': 'warm',
  disabled: 'mute',
  protected: 'cool',
};

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
}

export function ActionLog({ actions }: Props) {
  return (
    <div className="log">
      <AnimatePresence initial={false}>
        {actions.map((a) => (
          <motion.article
            key={`${a.pid}-${a.at}`}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="log__entry"
          >
            <header className="log__head">
              <time className="log__time mono">{clock(a.at)}</time>
              <span className={`chip chip--${a.kind === 'leak' ? 'warm' : 'data'}`}>
                {a.kind}
              </span>
              <span className={`chip chip--${VERDICT_TONE[a.verdict] ?? 'mute'}`}>
                {a.outcome ? `${a.verdict} · ${a.outcome}` : a.verdict}
              </span>
            </header>

            <p className="log__subject">
              <span className="log__cmd">{shortName(a.command)}</span>
              <span className="log__pid mono">pid {a.pid}</span>
            </p>

            <p className="log__reason">{a.reason}</p>

            <dl className="log__detail mono">
              {Object.entries(a.detail).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
            </dl>
          </motion.article>
        ))}
      </AnimatePresence>

      {actions.length === 0 && (
        <p className="log__empty">
          No detections. Machine is behaving.
        </p>
      )}
    </div>
  );
}
