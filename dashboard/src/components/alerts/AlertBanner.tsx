import { AnimatePresence, motion } from 'framer-motion';
import type { Alert } from '../../lib/types';
import './alerts.css';

interface Props {
  alerts: Alert[];
}

function duration(since: number): string {
  const s = Math.round((Date.now() - since) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)}m`;
}

/**
 * Alerts are the only thing allowed to interrupt the layout. Everything else
 * on this page is a reading you go looking for; an alert comes to you.
 */
export function AlertBanner({ alerts }: Props) {
  return (
    <AnimatePresence initial={false}>
      {alerts.map((alert) => (
        <motion.aside
          key={alert.id}
          layout
          role="alert"
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: 'auto', marginBottom: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={`alert alert--${alert.severity}`}
        >
          <div className="alert__inner">
            <span className="alert__mark" aria-hidden="true" />

            <div className="alert__body">
              <h2 className="alert__title">
                {alert.title}
                <span className={`chip chip--${alert.severity === 'critical' ? 'hot' : 'warm'}`}>
                  {alert.severity}
                </span>
                <span className="alert__age mono">for {duration(alert.since)}</span>
              </h2>
              <p className="alert__detail">{alert.detail}</p>
            </div>
          </div>
        </motion.aside>
      ))}
    </AnimatePresence>
  );
}
