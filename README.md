# customfan

Smart System Resource Thermal Daemon. Keeps this Mac running cold, fast, and
silent while you study.

- Monitors CPU temperature and fan speed locally
- Tracks background processes for memory leaks (RSS growth over time)
- Detects and (optionally) kills frozen background tasks — dry-run by default
- Fuses in **real exhaust-vent temperatures** from thermistors wired to a
  Raspberry Pi sitting on the Mac's vents
- Live dashboard with gauges, charts, and an action log

No hardware yet? Everything runs in **sim mode** (`SIM=1`) with realistic fake
sensor data. The Pi + thermistors swap in later without code changes.

## Architecture

```
┌──────────────── Mac ────────────────┐        ┌────── Raspberry Pi ──────┐
│ daemon/ (Node + TypeScript)         │  HTTP  │ pi-agent/ (Python)       │
│  • sensors: powermetrics/ioreg/SMC  │◄───────│  • DS18B20 (1-wire)      │
│  • sampler: per-proc CPU/RSS (ps)   │  POST  │  • thermistor via MCP3008│
│  • watchdog: leak detect + frozen   │        │  • sim mode w/o hardware │
│    detect + kill policy (dry-run)   │        └──────────────────────────┘
│  • Express + WebSocket API :4310    │
│ dashboard/ (React + Vite) :4311     │
│  • live charts, gauges, action log  │
└─────────────────────────────────────┘
```

## Build Stages

- [x] **Stage 1** — Scaffold, tech stack, hardware order list
- [x] **Stage 2** — Mac sensor layer (CPU temp, fan RPM, per-process sampling)
- [x] **Stage 3** — Watchdog engine (leak detection, frozen-task detection, kill policy)
- [x] **Stage 4** — Dashboard UI (live WebSocket charts + gauges)
- [x] **Stage 5** — Raspberry Pi vent-temp agent, DS18B20 path (sim until hardware)
- [ ] **Stage 6** — True analog thermistors via MCP3008 ADC + Steinhart–Hart
- [ ] **Stage 7** — launchd autostart, vent-clog alerts, polish

## Run

Two terminals:

```bash
# 1. daemon (sim mode — no hardware needed)
cd daemon
npm install
SIM=1 npm run dev      # → http://localhost:4310/health

# 2. dashboard
cd dashboard
npm install
npm run dev            # → http://localhost:4311
```

Drop `SIM=1` to read real Mac sensors (falls back gracefully — see below).
Want a leak to watch? `node daemon/tools/leaker.js` and the watchdog will flag
it within a scan cycle (log-only by default).

### Sensor sources

The daemon tries, in order: `smctemp` → `osx-cpu-temp` → `ioreg` battery
temperature → simulator. Every reading is tagged with where it came from, and
the dashboard displays that tag — a simulated number never masquerades as real.

For true die temperature on Apple Silicon: `brew install smctemp`. The daemon
picks it up automatically, no code change.

### Safety

The watchdog ships **disabled** (`killEnabled: false`) and **dry-run**
(`dryRun: true`). It detects and logs; it does not kill. Even fully armed, it
refuses to touch pid ≤ 1, itself, system-critical processes (`kernel_task`,
`WindowServer`, `Finder`…), anything under `/System/` or `/usr/libexec/`, and
whatever you list in `protectedPatterns`. Edit `daemon/customfan.config.json`.

### Vent probes (pi-agent)

```bash
# 3. vent temperatures — sim mode runs on your Mac, no Pi needed
cd pi-agent
SIM=1 python3 agent.py
```

The **exhaust vents** panel lights up. With real hardware, the same command on
a Pi reads DS18B20 probes taped over the Mac's vents — see
[pi-agent/SETUP.md](./pi-agent/SETUP.md) for wiring and systemd autostart.

Why this matters: the CPU can report a fine die temperature while the exhaust
is baking because a vent is blocked or a fan has failed. Comparing die temp to
vent temp is the thing a software-only monitor physically cannot do.

If the agent stops reporting, readings go **stale** after 10s — the dashboard
says "no agent" rather than showing a frozen number as if it were live.

## Hardware

See [HARDWARE.md](./HARDWARE.md) for the full Amazon order list. Nothing is
required until Stage 5 — every stage before that runs fully in sim mode.
# customfan
