import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { thermalState, type ThermalSource } from '../../lib/types';
import './gauge.css';

interface Props {
  tempC: number | null;
  source: ThermalSource;
  speedLimit: number | null;
}

const MIN_C = 30;
const MAX_C = 100;
/** Open-bottom dial: sweeps 240°, from 150° to 390° in SVG angle space. */
const START_ANGLE = 150;
const SWEEP = 240;
const RADIUS = 108;
const CENTER = 130;

function polar(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(rad),
    y: CENTER + radius * Math.sin(rad),
  };
}

function arcPath(fromDeg: number, toDeg: number, radius: number): string {
  const a = polar(fromDeg, radius);
  const b = polar(toDeg, radius);
  const largeArc = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${largeArc} 1 ${b.x} ${b.y}`;
}

function tempToAngle(tempC: number): number {
  const clamped = Math.min(MAX_C, Math.max(MIN_C, tempC));
  return START_ANGLE + ((clamped - MIN_C) / (MAX_C - MIN_C)) * SWEEP;
}

/** Tick marks every 10 °C, longer + labeled every 20 °C. */
const TICKS = Array.from({ length: (MAX_C - MIN_C) / 10 + 1 }, (_, i) => {
  const tempC = MIN_C + i * 10;
  return { tempC, angle: tempToAngle(tempC), major: tempC % 20 === 0 };
});

const TRACK_LENGTH = (SWEEP / 360) * 2 * Math.PI * RADIUS;

export function ThermalGauge({ tempC, source, speedLimit }: Props) {
  const arcRef = useRef<SVGPathElement>(null);
  const needleRef = useRef<SVGGElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  /** Animate from the previous value, not from zero, on every update. */
  const shown = useRef(MIN_C);

  const state = thermalState(tempC);
  const throttled = speedLimit !== null && speedLimit < 100;

  useEffect(() => {
    if (tempC === null) return;

    const from = shown.current;
    const proxy = { v: from };
    shown.current = tempC;

    const tl = gsap.to(proxy, {
      v: tempC,
      duration: 0.9,
      ease: 'power3.out',
      onUpdate: () => {
        const angle = tempToAngle(proxy.v);
        const swept = ((angle - START_ANGLE) / 360) * 2 * Math.PI * RADIUS;

        if (arcRef.current) {
          arcRef.current.style.strokeDasharray = `${swept} ${TRACK_LENGTH}`;
        }
        if (needleRef.current) {
          needleRef.current.setAttribute(
            'transform',
            `rotate(${angle} ${CENTER} ${CENTER})`,
          );
        }
        if (readoutRef.current) {
          readoutRef.current.textContent = proxy.v.toFixed(1);
        }
      },
    });

    return () => {
      tl.kill();
    };
  }, [tempC]);

  return (
    <div className={`gauge gauge--${state}`}>
      <svg viewBox="0 0 260 260" className="gauge__dial" aria-hidden="true">
        {/* Recessed track */}
        <path
          d={arcPath(START_ANGLE, START_ANGLE + SWEEP, RADIUS)}
          className="gauge__track"
        />

        {/* Live value arc — glows in its state color */}
        <path
          ref={arcRef}
          d={arcPath(START_ANGLE, START_ANGLE + SWEEP, RADIUS)}
          className="gauge__arc"
          style={{ strokeDasharray: `0 ${TRACK_LENGTH}` }}
        />

        {TICKS.map(({ tempC: t, angle, major }) => {
          const outer = polar(angle, RADIUS - 16);
          const inner = polar(angle, RADIUS - (major ? 28 : 22));
          const label = polar(angle, RADIUS - 42);
          return (
            <g key={t}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                className={major ? 'gauge__tick gauge__tick--major' : 'gauge__tick'}
              />
              {major && (
                <text x={label.x} y={label.y} className="gauge__tick-label">
                  {t}
                </text>
              )}
            </g>
          );
        })}

        <g ref={needleRef} transform={`rotate(${START_ANGLE} ${CENTER} ${CENTER})`}>
          <line
            x1={CENTER}
            y1={CENTER}
            x2={CENTER + RADIUS - 20}
            y2={CENTER}
            className="gauge__needle"
          />
        </g>
        <circle cx={CENTER} cy={CENTER} r="7" className="gauge__hub" />
      </svg>

      <div className="gauge__readout">
        <div className="gauge__value mono">
          <span ref={readoutRef}>{tempC?.toFixed(1) ?? '--'}</span>
          <span className="gauge__unit">°C</span>
        </div>
        <div className="gauge__meta">
          <span className={`chip chip--${state}`}>{state}</span>
          <span
            className={`chip ${source === 'sim' ? 'chip--mute' : 'chip--data'}`}
            title={
              source === 'sim'
                ? 'Simulated — no SMC reader installed'
                : `Live source: ${source}`
            }
          >
            {source}
          </span>
          {throttled && (
            <span className="chip chip--hot">throttled {speedLimit}%</span>
          )}
        </div>
      </div>
    </div>
  );
}
