"""customfan pi-agent — vent-temperature reporter.

Runs on a Raspberry Pi sitting on the Mac's exhaust vents. Reads temperature
probes and POSTs them to the Mac daemon on a fixed interval.

Standard library only — nothing to pip install on the Pi.

Sensor selection:
  SIM=1                  → simulated probes (works anywhere, no hardware)
  DS18B20 on the bus     → used automatically
  neither                → falls back to sim with a loud warning

Usage:
    SIM=1 python3 agent.py                       # works on your Mac today
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
from sensors.sim import SimVentSensor

DAEMON_URL = os.environ.get("DAEMON_URL", "http://localhost:4310")
POST_PATH = "/api/vent-temps"
INTERVAL_SEC = float(os.environ.get("INTERVAL", "2"))
POST_TIMEOUT_SEC = 4.0
SIM_MODE = os.environ.get("SIM") == "1"
AGENT_ID = os.environ.get("AGENT_ID", "pi-vent-01")

_running = True


def _stop(_signum: int, _frame: object) -> None:
    global _running
    _running = False


def pick_sensor() -> VentSensor:
    if SIM_MODE:
        return SimVentSensor()

    if DS18B20Sensor.available():
        return DS18B20Sensor()

    print(
        "[pi-agent] WARNING: no DS18B20 probes found on the 1-wire bus.\n"
        "[pi-agent]   Check: dtoverlay=w1-gpio in /boot/firmware/config.txt,\n"
        "[pi-agent]          4.7k pull-up between DATA and 3V3, then reboot.\n"
        "[pi-agent]   Falling back to SIMULATED data — readings are not real.",
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
