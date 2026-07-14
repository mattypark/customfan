"""customfan pi-agent — vent-temperature reporter.

Runs on a Raspberry Pi sitting on the Mac's exhaust vents. Reads temperature
probes and POSTs them to the Mac daemon on a fixed interval.

Standard library only — nothing to pip install on the Pi.

Sensor selection (first match wins):
  SIM=1                  → simulated probes (works anywhere, no hardware)
  DS18B20 on the 1-wire bus
  MCP3008 thermistors on SPI
  none of the above      → falls back to sim with a loud warning

Force one with SENSOR=ds18b20 | thermistor | sim.

Usage:
    SIM=1 python3 agent.py                       # works on your Mac today
    SIM=1 SENSOR=thermistor python3 agent.py     # sim the analog path
    python3 agent.py                             # on the Pi, real probes
    DAEMON_URL=http://192.168.1.20:4310 python3 agent.py
"""

from __future__ import annotations

import json
import os
import signal
import sys
import time
import urllib.error
import urllib.request

from sensors.base import VentSensor
from sensors.ds18b20 import DS18B20Sensor
from sensors.mcp3008 import MCP3008
from sensors.sim import SimVentSensor
from sensors.thermistor import ThermistorSensor, build_sim_thermistor

DAEMON_URL = os.environ.get("DAEMON_URL", "http://localhost:4310")
POST_PATH = "/api/vent-temps"
INTERVAL_SEC = float(os.environ.get("INTERVAL", "2"))
POST_TIMEOUT_SEC = 4.0
SIM_MODE = os.environ.get("SIM") == "1"
AGENT_ID = os.environ.get("AGENT_ID", "pi-vent-01")

# Which sensor to use: "ds18b20" | "thermistor" | "sim" | "" (auto-detect)
SENSOR_CHOICE = os.environ.get("SENSOR", "").lower()
THERMISTOR_CHANNELS = [
    int(c) for c in os.environ.get("CHANNELS", "0,1,2").split(",")
]

_running = True


def _stop(_signum: int, _frame: object) -> None:
    global _running
    _running = False


def pick_sensor() -> VentSensor:
    if SIM_MODE:
        # In sim, SENSOR=thermistor exercises the analog conversion chain
        # (counts → resistance → Steinhart–Hart) instead of the 1-wire path.
        if SENSOR_CHOICE == "thermistor":
            return build_sim_thermistor(THERMISTOR_CHANNELS)
        return SimVentSensor()

    if SENSOR_CHOICE == "ds18b20":
        return DS18B20Sensor()
    if SENSOR_CHOICE == "thermistor":
        return ThermistorSensor(adc=MCP3008(), channels=THERMISTOR_CHANNELS)

    # Auto-detect: DS18B20 first (simpler, more accurate out of the box),
    # then the analog thermistor stack.
    if DS18B20Sensor.available():
        return DS18B20Sensor()
    if ThermistorSensor.available():
        return ThermistorSensor(adc=MCP3008(), channels=THERMISTOR_CHANNELS)

    print(
        "[pi-agent] WARNING: no probes found.\n"
        "[pi-agent]   DS18B20: needs dtoverlay=w1-gpio in "
        "/boot/firmware/config.txt,\n"
        "[pi-agent]            a 4.7k pull-up between DATA and 3V3, and a reboot.\n"
        "[pi-agent]   MCP3008: needs SPI enabled (raspi-config) and spidev "
        "installed.\n"
        "[pi-agent]   Falling back to SIMULATED data — readings are NOT real.",
        file=sys.stderr,
    )
    return SimVentSensor()


def post(payload: dict) -> bool:
    request = urllib.request.Request(
        DAEMON_URL + POST_PATH,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=POST_TIMEOUT_SEC) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, OSError):
        # Daemon asleep or Mac off the network. Not fatal — keep sampling and
        # retry; the Pi should survive the Mac rebooting.
        return False


def main() -> None:
    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    # Python buffers stdout when it isn't a TTY — without this, systemd and
    # `journalctl -f` would show nothing until the process exits.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)

    sensor = pick_sensor()
    print(f"[pi-agent] {AGENT_ID} · sensor: {sensor.describe()}")
    print(f"[pi-agent] posting to {DAEMON_URL}{POST_PATH} every {INTERVAL_SEC}s")

    connected = False  # only log connection state on change, not every tick

    while _running:
        readings = sensor.read()

        if not readings:
            print("[pi-agent] no valid probe readings this cycle", file=sys.stderr)
            time.sleep(INTERVAL_SEC)
            continue

        ok = post(
            {
                "agentId": AGENT_ID,
                "readings": [
                    {
                        "probeId": r.probe_id,
                        "tempC": r.temp_c,
                        "source": r.source,
                    }
                    for r in readings
                ],
            }
        )

        if ok != connected:
            connected = ok
            hottest = max(r.temp_c for r in readings)
            print(
                f"[pi-agent] daemon {'connected' if ok else 'unreachable'} "
                f"(hottest probe {hottest:.1f}°C)"
            )

        time.sleep(INTERVAL_SEC)

    print("[pi-agent] stopped")


if __name__ == "__main__":
    main()
