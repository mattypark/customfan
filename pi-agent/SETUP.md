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

## Real hardware — analog thermistors via MCP3008

The DS18B20 path above is easier and is already accurate. This path exists
because it's the *real* analog problem: a thermistor is just a resistor that
changes with heat, the Pi has no analog input, and bridging that gap means an
ADC, a voltage divider, and the Steinhart–Hart equation.

### Sim first (do this now, no hardware)

```bash
SIM=1 SENSOR=thermistor python3 agent.py     # the analog conversion chain
SIM=1 python3 calibrate.py                   # rehearse the calibration flow
python3 -m unittest discover                 # 19 tests, all the math
```

The simulator fakes **raw ADC counts**, not temperatures — the production
conversion code then turns those counts back into °C exactly as it will on
hardware. The math under test is the math that ships.

### 1. Wiring

Thermistor and a fixed 10 kΩ resistor form a voltage divider. The MCP3008
reports where the junction sits between GND and 3V3.

```
                    ┌──────────────────┐
    3V3 ────────────┤ 16 VDD    CH0 1  ├──────┬──── [ NTC thermistor ] ──── 3V3
    3V3 ────────────┤ 15 VREF   CH1 2  ├──┐   │
    GND ────────────┤ 14 AGND   CH2 3  ├┐ │   └──── [ 10kΩ fixed ] ──── GND
  GPIO11/SCLK ──────┤ 13 CLK    CH3 4  ││ │
  GPIO9/MISO ───────┤ 12 DOUT   CH4 5  ││ └── (same divider pattern, probe 2)
  GPIO10/MOSI ──────┤ 11 DIN    CH5 6  │└──── (same divider pattern, probe 3)
  GPIO8/CE0 ────────┤ 10 CS     CH6 7  │
    GND ────────────┤  9 DGND   CH7 8  │
                    └──────────────────┘
```

Each probe repeats the same divider on its own channel:

```
    3V3 ──[ NTC thermistor ]──┬──[ 10kΩ fixed ]── GND
                              │
                              └── MCP3008 CHn
```

**Why VREF ties to the same 3V3 as the divider:** the ADC reports a *ratio*,
so if the supply sags, both the divider output and the reference sag together
and the ratio is unchanged. The reading stays correct on a Pi whose 3V3 rail
wobbles under load. Tie VREF to anything else and you throw that away.

### 2. Enable SPI

```bash
sudo raspi-config      # Interface Options → SPI → Yes
sudo reboot
ls /dev/spidev0.0      # must exist
```

The agent needs `spidev`:

```bash
sudo apt install python3-spidev
```

(This is the only dependency in the whole project, and only for this path.)

### 3. Run

```bash
SENSOR=thermistor python3 agent.py
```

Auto-detect also works: with no DS18B20 on the bus, the agent finds the
MCP3008 by itself.

### 4. Calibrate (worth the ten minutes)

Datasheet beta gets you ~±1 °C. Fitting Steinhart–Hart from three real
measurements gets ~±0.1 °C.

```bash
python3 calibrate.py
```

Three points, spread **wide** — ice water, room, hot mug. The tool refuses a
span under 15 °C, because clustered points cannot define a curve and would
produce coefficients that silently corrupt every future reading. It also
checks that the fitted curve reproduces its own input points before writing.

Writes `calibration.json`, picked up automatically on the next agent start.
It's gitignored: coefficients belong to *your* specific thermistors.

---

## Environment variables

| Var | Default | Meaning |
|-----|---------|---------|
| `SIM` | unset | `1` forces simulated probes |
| `SENSOR` | auto-detect | `ds18b20` \| `thermistor` \| `sim` |
| `CHANNELS` | `0,1,2` | MCP3008 channels (thermistor path only) |
| `DAEMON_URL` | `http://localhost:4310` | Where the Mac daemon lives |
| `INTERVAL` | `2` | Seconds between readings |
| `AGENT_ID` | `pi-vent-01` | Name shown on the dashboard |

---

## Troubleshooting

| Symptom | Cause |
|---------|-------|
| No `28-*` directories | `dtoverlay=w1-gpio` missing, or no reboot, or no pull-up resistor |
| Reading is exactly `85.0 °C` | DS18B20 reset without a real conversion — insufficient power. Rejected automatically. |
| `crc=… NO` in `w1_slave` | Corrupt data — bad pull-up value or wires too long. Rejected automatically. |
| `ADC reads 0 — open circuit` | Thermistor not connected, or a broken wire on that channel. |
| `ADC reads 1023 — shorted` | Thermistor shorted, or the 10 kΩ fixed resistor is missing from the divider. |
| Thermistor reads wildly wrong | `R_fixed` isn't actually 10 kΩ, or the divider is wired the other way round (thermistor to GND instead of 3V3). |
| Calibration refused: "span" | Your three points were too close together. Ice water → hot mug. |
| Agent says "daemon unreachable" | Wrong `DAEMON_URL`, Mac asleep, or firewall. The agent keeps retrying; this is not fatal. |
| Dashboard shows "no agent" | Agent stopped, or last POST was >10s ago (readings go stale rather than lie). |

Note that every one of these fault conditions causes the probe to be **skipped**,
never guessed at. A thermal safety tool that invents a plausible temperature
when its sensor is broken is worse than no tool at all.
