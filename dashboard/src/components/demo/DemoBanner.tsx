import { useEffect, useState } from 'react';
import { demoPhaseLabel } from '../../lib/demoFeed';
import './demo.css';

interface Props {
  startedAt: number;
}

const REPO_URL = 'https://github.com/mattypark/customfan';

/**
 * States plainly that this is a simulation.
 *
 * The real daemon reads Mac hardware and talks to a Raspberry Pi on the local
 * network — it cannot run on a static host, and pretending otherwise would be
 * the same dishonesty the product itself refuses (a sensor that invents a
 * plausible number when it can't actually measure).
 *
 * It also narrates the scripted story, because a visitor gives this page about
 * thirty seconds and needs to know what they're watching.
 */
export function DemoBanner({ startedAt }: Props) {
  const [label, setLabel] = useState(() => demoPhaseLabel(startedAt));

  useEffect(() => {
    const id = setInterval(() => setLabel(demoPhaseLabel(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const blocked = label.startsWith('VENT BLOCKED');

  return (
    <aside className={`demo${blocked ? ' demo--blocked' : ''}`}>
      <div className="demo__row">
        <span className="chip chip--data">simulated</span>
        <p className="demo__copy">
          Live demo — no hardware attached. The real daemon reads this Mac's
          sensors and receives vent temperatures from a Raspberry Pi on the
          local network, so it cannot run on a web host.{' '}
          <a href={REPO_URL} className="demo__link">
            Source and hardware build →
          </a>
        </p>
      </div>

      <p className="demo__phase mono" aria-live="polite">
        <span className="demo__dot" />
        {label}
      </p>
    </aside>
  );
}
