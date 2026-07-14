# Deploying the demo

## What can and cannot be deployed

**The daemon cannot run on Vercel — or any web host.** This is architectural,
not a configuration problem:

| The daemon does this | A web host cannot |
|----------------------|-------------------|
| Reads *your Mac's* CPU temp and fan (`smctemp`, `ioreg`) | It's a Linux container in a datacenter with no access to your machine |
| Enumerates and terminates local processes (`ps`, `kill`) | Serverless functions have no such host to inspect |
| Holds a long-lived WebSocket to push telemetry | Vercel's serverless functions don't hold persistent connections |
| Receives HTTP posts from a Raspberry Pi on your LAN | Your Pi is not on the public internet |

Claiming a live deployment of the real product would be claiming something
architecturally impossible. Anyone technical spots that immediately.

## What you deploy instead

**The dashboard, in demo mode.** The simulation runs in the visitor's browser
and drives the exact same data shape the real daemon broadcasts — same gauge,
same charts, same vent probes, same alert engine output. Zero backend.

It runs a scripted 90-second loop, because a visitor gives the page about
thirty seconds and the product has exactly one moment worth seeing:

| Time | What's on screen |
|------|------------------|
| 0–18s | Healthy machine. Exhaust warm — heat is escaping. |
| 18–38s | Load ramps. Fan spins up, exhaust heats with it. Cooling is working. |
| 38–70s | **The vent blocks.** CPU stays at 88 °C, fan stays at 5,400 RPM — but the exhaust goes cold. customfan raises the alert software alone cannot raise. |
| 70–90s | Vent cleared. Trapped heat escapes, alert clears, machine settles. |

A banner states plainly that it's simulated and links to the source. That
honesty is the same principle the product itself enforces: never present a
number you didn't actually measure.

## Deploy

```bash
npm i -g vercel      # if you don't have it
cd ~/Downloads/CTechincal-projects/Hardware/customfan
vercel               # first run: links the project
vercel --prod        # ship it
```

`vercel.json` already sets `VITE_DEMO=1` and points at `dashboard/dist`.
Nothing else to configure.

Or connect the GitHub repo at [vercel.com/new](https://vercel.com/new) — it
reads `vercel.json` and every push to `main` redeploys.

## Test the demo build locally first

```bash
cd dashboard
VITE_DEMO=1 npm run build && npm run preview     # → localhost:4173
```

You can also flip any local dashboard into demo mode with a query param, no
rebuild: **http://localhost:4311/?demo**

## What to actually put in the YC application

Lead with the problem, not the stack. The demo link is evidence, not the pitch.

> Your laptop's fan is screaming and the CPU is at 88 °C. Every monitoring tool
> says the same thing: *it's hot, and the fan is working.* But if the vent is
> choked with dust, no hot air is actually coming out — and no software can tell,
> because from the inside a blocked machine looks identical to a healthy one
> under load.
>
> customfan wires thermistors to a Raspberry Pi sitting on the exhaust vents and
> watches for the contradiction: CPU hot + fan working + **exhaust cold** = the
> airflow path is blocked. It's a diagnosis that is physically impossible to make
> in software alone.
>
> Live demo (simulated, no hardware): `<your-url>`
> Source, hardware build, and wiring: `<repo>`
> 51 tests, no hardware required to run any of them.

Two things worth mentioning, because they're what an engineer would probe for:

- **Every sensor refuses to guess.** A disconnected thermistor reads 0 ADC
  counts, which converts to a *believable* temperature — the code raises
  instead. A DS18B20 reporting exactly 85.0 °C has reset without a real
  conversion; that reading is dropped. The vent-clog rule cannot fire without
  probe data.
- **The watchdog ships doubly disabled** (`killEnabled: false` *and*
  `dryRun: true`), and its guards on system-critical processes ignore config
  entirely — no setting can switch them off.
