import './charts.css';

interface Props {
  values: number[];
  label: string;
  unit: string;
  /** Fixed domain keeps the line from rescaling every tick (visual lying). */
  domain: [number, number];
  tone?: 'cool' | 'warm' | 'hot' | 'data';
}

const W = 100;
const H = 30;

/**
 * Fixed-domain sparkline. No axis rescaling: a flat line means flat, and the
 * same height always means the same value.
 */
export function Sparkline({ values, label, unit, domain, tone = 'data' }: Props) {
  const [lo, hi] = domain;
  const latest = values[values.length - 1];

  const points = values.map((v, i) => {
    const x = values.length === 1 ? W : (i / (values.length - 1)) * W;
    const norm = (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo);
    return { x, y: H - norm * H };
  });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area =
    points.length > 1
      ? `${line} L ${W} ${H} L 0 ${H} Z`
      : '';

  return (
    <div className={`spark spark--${tone}`}>
      <div className="spark__head">
        <span className="panel-label">{label}</span>
        <span className="spark__value mono">
          {latest === undefined ? '--' : Math.round(latest).toLocaleString()}
          <span className="spark__unit">{unit}</span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="spark__svg"
        aria-label={`${label} history`}
      >
        {area && <path d={area} className="spark__area" />}
        {points.length > 1 && <path d={line} className="spark__line" />}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1]!.x}
            cy={points[points.length - 1]!.y}
            r="1.6"
            className="spark__head-dot"
          />
        )}
      </svg>

      <div className="spark__scale mono">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
    </div>
  );
}
