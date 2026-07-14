# customfan

**A thermal daemon that can tell you your laptop's vent is blocked — because it
actually put a thermometer in the exhaust.**

customfan keeps a Mac running cold, fast, and silent while you work. It watches
CPU temperature and fan speed, hunts down memory-leaking and frozen background
processes, and fuses in **real exhaust-vent temperatures** measured by
thermistors wired to a Raspberry Pi sitting on the vents.

That last part is the point.

## The problem software can't see

Your Mac's CPU is at 88°C. The fan is screaming at 5,000 RPM. Every
software monitor on the market reports the same thing: *the machine is hot, and
the cooling system is working hard.* Nothing looks wrong.

But if the vent is choked with dust — or the laptop is sitting on a duvet —
then **no hot air is actually coming out**. The fan spins, the CPU cooks, and
the machine slowly throttles itself into uselessness. Software cannot detect
this, because from the inside it looks identical to a machine that is cooling
correctly.

customfan puts a physical probe in the exhaust stream, and watches for the
contradiction:

| Signal | Reading |
|--------|---------|
| CPU temperature | 86.9 °C — **hot** |
| Fan speed | 5,245 RPM — **working hard** |
| Exhaust temperature | 2.5 °C above room — **cold** |

Those three facts cannot all be true unless the airflow path is blocked. That
diagnosis is what the hardware buys you, and it is the one thing a software-only
monitor is physically incapable of concluding.

## Live demo

**[customfan.vercel.app](https://customfan.vercel.app)** — simulated, no
hardware attached. Runs a scripted 90-second loop: a healthy machine under
load, then the vent blocks, then it clears. Watch the exhaust temperature at
35s versus 60s — same CPU, same fan, completely different verdict.

The real daemon reads Mac hardware and receives posts from a Pi on the local
network, so it cannot run on a web host. See [DEPLOY.md](./DEPLOY.md) for why,
and what is actually deployed.

## Architecture

```
┌──────────────── Mac ────────────────┐        ┌────── Raspberry Pi ──────┐
│ daemon/ (Node + TypeScript)         │  HTTP  │ pi-agent/ (Python)       │
│  • sensors: smctemp / ioreg / SMC   │◄───────│  • DS18B20 (1-wire)      │
│  • sampler: per-proc CPU/RSS (ps)   │  POST  │  • thermistors + MCP3008 │
│  • watchdog: leak + frozen detect,  │        │  • sim mode w/o hardware │
│    guarded kill policy              │        └──────────────────────────┘
│  • alerts: vent-clog, fan failure   │              sits on the vents
│  • Express + WebSocket :4310        │
│ dashboard/ (React + Vite) :4311     │
│  • gauge, traces, vent probes, log  │
└─────────────────────────────────────┘
```

## Run it (no hardware required)

Everything runs in **sim mode**. The Pi and the thermistors swap in later
without a single code change.

```bash
# 1. daemon
cd daemon && npm install
SIM=1 npm run dev              # → localhost:4310/health

# 2. dashboard
cd dashboard && npm install
npm run dev                    # → localhost:4311

# 3. vent probes
cd pi-agent
SIM=1 python3 agent.py         # DS18B20 path
SIM=1 SENSOR=thermistor python3 agent.py   # analog MCP3008 path
```

### See the headline feature

```bash
cd daemon
SIM=1 SIM_HOT=1 npm run dev    # a Mac under heavy sustained load
node tools/demo-clog.js        # a Pi reporting a cold exhaust
```

Within ~20 seconds the dashboard raises a critical **vent-clog** alert. Stop
the demo and report a hot exhaust instead, and it clears.

### See the watchdog catch a leak

```bash
node daemon/tools/leaker.js    # deliberately leaks ~20 MB/s
```

It's flagged within a scan cycle — log-only, nothing is killed.

### Demo mode (no daemon at all)

The dashboard can run the whole simulation in the browser:
**http://localhost:4311/?demo** — or `VITE_DEMO=1 npm run build`. This is what
gets deployed.

## Install (starts at login)

```bash
./install.sh              # user-level LaunchAgent, no sudo, ever
./install.sh --uninstall
```

Deliberately a user-level agent, never a root daemon. A background process that
can terminate other processes has no business running with elevated privileges.

## Safety

The watchdog ships **doubly disabled**: `killEnabled: false` *and*
`dryRun: true`. Out of the box it detects and logs; it kills nothing.

Even fully armed, it refuses to touch:

- pid ≤ 1, and itself
- system-critical processes — `kernel_task`, `WindowServer`, `loginwindow`, `Finder`…
- anything under `/System/`, `/usr/libexec/`, `/usr/sbin/`, `/sbin/`
- anything matching your own `protectedPatterns`

These guards ignore config entirely — no setting can switch them off. Tune the
rest in `daemon/customfan.config.json`.

## Sensors, and honesty about them

The daemon tries, in order: `smctemp` → `osx-cpu-temp` → `ioreg` battery
temperature → simulator. **Every reading is tagged with where it came from**,
and the dashboard displays that tag. A simulated number never masquerades as a
real one.

For true die temperature on Apple Silicon: `brew install smctemp` — picked up
automatically, no code change.

## Design principle: refuse to guess

Every sensor in this project fails loudly rather than plausibly.

- A disconnected thermistor reads 0 ADC counts, which converts to a
  *believable* temperature. The code raises instead.
- A DS18B20 reporting exactly 85.0 °C has reset without a real conversion. That
  reading is dropped.
- A vent agent that goes quiet goes **stale**, not frozen-but-current.
- The vent-clog rule **cannot fire without probe data** — with no Pi reporting,
  it stays silent rather than inferring.

A thermal safety tool that invents a convincing number when its sensor is
broken is worse than no tool at all.

## Tests

```bash
cd daemon   && npm test                      # 32 — leak math, kill policy, alert rules
cd pi-agent && python3 -m unittest discover  # 19 — thermistor math, ADC fault modes
```

51 tests. All run with no hardware and no network.

## Build stages

- [x] **Stage 1** — Scaffold, tech stack, hardware order list
- [x] **Stage 2** — Mac sensor layer (CPU temp, fan RPM, per-process sampling)
- [x] **Stage 3** — Watchdog engine (leak detection, frozen-task detection, kill policy)
- [x] **Stage 4** — Dashboard UI (live WebSocket gauge, traces, action log)
- [x] **Stage 5** — Raspberry Pi vent-temp agent, DS18B20 path
- [x] **Stage 6** — Analog thermistors via MCP3008 ADC + Steinhart–Hart calibration
- [x] **Stage 7** — launchd autostart, vent-clog alerts, docs

## Hardware

See [HARDWARE.md](./HARDWARE.md) for the Amazon order list (~$70 for the core
Pi + DS18B20 path, ~$23 more for the analog thermistor upgrade) and
[pi-agent/SETUP.md](./pi-agent/SETUP.md) for wiring diagrams, SPI/1-wire setup,
calibration, and systemd autostart.

Nothing is required to run or develop any part of this. Order when you're ready.
