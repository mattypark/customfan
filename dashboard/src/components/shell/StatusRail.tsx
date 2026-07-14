import type { ConnectionState } from '../../hooks/useDaemonFeed';
import type { WatchdogConfigView } from '../../lib/types';
import './shell.css';

interface Props {
  connection: ConnectionState;
  config: WatchdogConfigView | undefined;
  suspectCount: number;
  alertCount: number;
}

/**
 * Enforcement posture in plain words. The dashboard must never let you
 * *think* the watchdog is armed when it isn't — or vice versa.
 */
function enforcement(config: WatchdogConfigView | undefined) {
  if (!config) return { label: 'unknown', tone: 'mute' as const };
  if (!config.killEnabled) return { label: 'observe only', tone: 'cool' as const };
  if (config.dryRun) return { label: 'dry run', tone: 'warm' as const };
  return { label: 'armed · will kill', tone: 'hot' as const };
}

const CONNECTION_TONE: Record<ConnectionState, string> = {
  live: 'cool',
  connecting: 'warm',
  lost: 'hot',
};

export function StatusRail({
  connection,
  config,
  suspectCount,
  alertCount,
}: Props) {
  const enf = enforcement(config);

  return (
    <header className="rail">
      <div className="rail__brand">
        <h1 className="rail__title mono">customfan</h1>
        <p className="rail__tag">thermal daemon · resource watchdog</p>
      </div>

      <div className="rail__status">
        <span className={`chip chip--${CONNECTION_TONE[connection]}`}>
          <span className={`rail__led rail__led--${connection}`} />
          {connection}
        </span>

        <span className={`chip chip--${enf.tone}`}>{enf.label}</span>

        <span className={`chip chip--${suspectCount > 0 ? 'hot' : 'mute'}`}>
          {suspectCount} leak {suspectCount === 1 ? 'suspect' : 'suspects'}
        </span>

        <span className={`chip chip--${alertCount > 0 ? 'hot' : 'cool'}`}>
          {alertCount === 0
            ? 'nominal'
            : `${alertCount} alert${alertCount === 1 ? '' : 's'}`}
        </span>
      </div>
    </header>
  );
}
