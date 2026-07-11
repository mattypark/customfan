# customfan dashboard

Live instrument panel for the customfan daemon. React + Vite, connects to
`ws://localhost:4310/ws` and renders the thermal gauge, temp/fan traces,
process table, and watchdog action log.

```bash
npm install
npm run dev        # http://localhost:4311
```

Requires the daemon running (`cd ../daemon && SIM=1 npm run dev`). Point
somewhere else with `VITE_DAEMON_WS=ws://host:port/ws`.

## Design notes

Direction: **rack-mounted instrument panel**. Machined near-black chassis,
phosphor-green data, amber and red reserved for real trouble — color is state,
never decoration.

- Gauge and sparklines are hand-rolled SVG, no chart library
- GSAP eases the gauge needle/arc from its previous value, so it settles like
  a physical instrument instead of snapping
- Framer Motion handles list entry/exit in the process table and action log
- Sparklines use a **fixed domain** — a flat line means flat, and the same
  height always means the same value
- Every reading is tagged with its source (`smctemp` / `battery-proxy` / `sim`)
  so the UI never implies a simulated number is real
