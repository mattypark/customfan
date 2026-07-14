import { useDaemonFeed } from './hooks/useDaemonFeed';
import { ThermalGauge } from './components/gauge/ThermalGauge';
import { Sparkline } from './components/charts/Sparkline';
import { ProcessTable } from './components/processes/ProcessTable';
import { ActionLog } from './components/log/ActionLog';
import { VentPanel } from './components/vent/VentPanel';
import { AlertBanner } from './components/alerts/AlertBanner';
import { DemoBanner } from './components/demo/DemoBanner';
import { StatusRail } from './components/shell/StatusRail';
import { thermalState } from './lib/types';
import './App.css';

export default function App() {
  const {
    frame,
    tempHistory,
    fanHistory,
    connection,
    isDemo,
    demoStartedAt,
  } = useDaemonFeed();

  const thermals = frame?.thermals ?? null;
  const state = thermalState(thermals?.cpuTempC ?? null);
  const suspects = frame?.leakSuspects.filter((s) => s.isLeaking) ?? [];

  return (
    <div className="app">
      <StatusRail
        connection={connection}
        config={frame?.config}
        suspectCount={suspects.length}
        alertCount={frame?.alerts.length ?? 0}
      />

      {isDemo && <DemoBanner startedAt={demoStartedAt} />}

      {/* Alerts interrupt. Everything else is a reading you go looking for. */}
      <AlertBanner alerts={frame?.alerts ?? []} />

      <main className="app__grid">
        {/* Hero: the temperature is the product. Everything else supports it. */}
        <section className="panel app__gauge" aria-label="CPU temperature">
          <ThermalGauge
            tempC={thermals?.cpuTempC ?? null}
            source={thermals?.tempSource ?? 'sim'}
            speedLimit={thermals?.cpuSpeedLimit ?? null}
          />
        </section>

        <div className="app__traces">
          <section className="panel">
            <Sparkline
              values={tempHistory}
              label="cpu temp"
              unit="°C"
              domain={[30, 100]}
              tone={state}
            />
          </section>
          <section className="panel">
            <Sparkline
              values={fanHistory}
              label="fan speed"
              unit=" rpm"
              domain={[0, 6500]}
              tone="data"
            />
          </section>
        </div>

        {/* The physical sensor — what a software-only monitor cannot see. */}
        <section className="panel app__vent" aria-label="Exhaust vent temperature">
          <h2 className="app__panel-title panel-label">
            exhaust vents
            <span className="app__panel-note">raspberry pi probes</span>
          </h2>
          <VentPanel
            vent={frame?.vent}
            cpuTempC={thermals?.cpuTempC ?? null}
          />
        </section>

        <section className="panel app__proc" aria-label="Top processes by CPU">
          <h2 className="app__panel-title panel-label">
            top processes
            <span className="app__panel-note">leak suspects lit red</span>
          </h2>
          <ProcessTable
            processes={frame?.topByCpu ?? []}
            leakSuspects={frame?.leakSuspects ?? []}
          />
        </section>

        <section className="panel app__log" aria-label="Watchdog action log">
          <h2 className="app__panel-title panel-label">
            watchdog log
            <span className="app__panel-note">
              scan every {frame?.config.scanIntervalSec ?? '--'}s
            </span>
          </h2>
          <ActionLog actions={frame?.actions ?? []} />
        </section>
      </main>
    </div>
  );
}
