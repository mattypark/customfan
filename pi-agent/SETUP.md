# pi-agent setup

Reports exhaust-vent temperatures from a Raspberry Pi to the Mac daemon.

**No hardware yet?** Skip to [Sim mode](#sim-mode-no-hardware) — it runs on your
Mac right now and exercises the entire pipeline.

---

## Sim mode (no hardware)

```bash
cd pi-agent
SIM=1 python3 agent.py
```

Generates a realistic exhaust curve (three probes at different distances from
the vent, thermal lag, load cycles) and POSTs it to `http://localhost:4310`.
The dashboard's **exhaust vents** panel comes alive immediately.

---

## Real hardware — DS18B20 probes

### 1. Wiring

The DS18B20 is a 1-wire digital sensor. Three wires, plus **one 4.7 kΩ
pull-up resistor between DATA and 3V3** — without it the bus reads nothing.

```
   DS18B20 probe               Raspberry Pi 40-pin header
   ───────────────             ─────────────────────────────
   RED    (VDD)  ──────────────  Pin 1   3V3
   BLACK  (GND)  ──────────────  Pin 6   GND
   YELLOW (DATA) ──────┬───────  Pin 7   GPIO4
                       │
                    [4.7 kΩ]          ← pull-up resistor
                       │
                    Pin 1  3V3
```

All probes share the same three rails — **1-wire means you can hang all three
probes off GPIO4 in parallel** and still need only the single 4.7 kΩ resistor.
Each has a unique factory ROM id, so the daemon tells them apart automatically.

Probe placement: tape one directly over the exhaust vent (the one that matters),
one an inch away, one on the chassis as a reference. The differences between
them are what reveal a blocked vent.

### 2. Enable the 1-wire bus

```bash
sudo nano /boot/firmware/config.txt      # older Pi OS: /boot/config.txt
```

Add this line, then reboot:

```
dtoverlay=w1-gpio
```

```bash
sudo reboot
```

### 3. Confirm the probes appear

```bash
ls /sys/bus/w1/devices/
# 28-3c01d607xxxx  28-3c01d607yyyy  28-3c01d607zzzz  w1_bus_master1
```

Every `28-*` directory is one probe. No `28-*` entries means the overlay isn't
active or the pull-up resistor is missing.

### 4. Run the agent

```bash
git clone <your repo> && cd customfan/pi-agent
DAEMON_URL=http://<your-mac-ip>:4310 python3 agent.py
```

Find your Mac's IP with `ipconfig getifaddr en0`. No pip install needed — the
agent is standard library only.

### 5. Autostart on boot (systemd)

```bash
sudo nano /etc/systemd/system/customfan-agent.service
```

```ini
[Unit]
Description=customfan vent-temperature agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/customfan/pi-agent
Environment=DAEMON_URL=http://192.168.1.20:4310
Environment=AGENT_ID=pi-vent-01
ExecStart=/usr/bin/python3 agent.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now customfan-agent
journalctl -u customfan-agent -f        # watch it run
```

`Restart=always` means the Pi survives your Mac rebooting — the agent keeps
sampling and reconnects when the daemon comes back.

---

## Environment variables

| Var | Default | Meaning |
|-----|---------|---------|
| `SIM` | unset | `1` forces simulated probes |
| `DAEMON_URL` | `http://localhost:4310` | Where the Mac daemon lives |
| `INTERVAL` | `2` | Seconds between readings |
| `AGENT_ID` | `pi-vent-01` | Name shown on the dashboard |

---

## Troubleshooting

| Symptom | Cause |
|---------|-------|
| No `28-*` directories | `dtoverlay=w1-gpio` missing, or no reboot, or no pull-up resistor |
| Reading is exactly `85.0 °C` | Sensor reset without a real conversion — insufficient power. Rejected automatically by the agent. |
| `crc=… NO` in `w1_slave` | Corrupt data — bad pull-up value or wires too long. Rejected automatically. |
| Agent says "daemon unreachable" | Wrong `DAEMON_URL`, Mac asleep, or firewall. The agent keeps retrying; this is not fatal. |
| Dashboard shows "no agent" | Agent stopped, or last POST was >10s ago (readings go stale rather than lie). |
