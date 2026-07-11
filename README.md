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
- [ ] **Stage 2** — Mac sensor layer (CPU temp, fan RPM, per-process sampling)
- [ ] **Stage 3** — Watchdog engine (leak detection, frozen-task detection, kill policy)
- [ ] **Stage 4** — Dashboard UI (live WebSocket charts + gauges)
- [ ] **Stage 5** — Raspberry Pi vent-temp agent, DS18B20 path (sim until hardware)
- [ ] **Stage 6** — True analog thermistors via MCP3008 ADC + Steinhart–Hart
- [ ] **Stage 7** — launchd autostart, vent-clog alerts, polish

## Run

```bash
# daemon (sim mode — no hardware needed)
cd daemon
npm install
SIM=1 npm run dev
# → http://localhost:4310/health
```

Dashboard and pi-agent come online in Stages 4 and 5.

## Hardware

See [HARDWARE.md](./HARDWARE.md) for the full Amazon order list. Nothing is
required until Stage 5 — every stage before that runs fully in sim mode.
# customfan
