"""customfan pi-agent — vent-temperature reporter (skeleton).

Runs on a Raspberry Pi sitting on the Mac's exhaust vents. Reads DS18B20
probes (Stage 5) or analog thermistors via MCP3008 (Stage 6) and POSTs
readings to the Mac daemon.

No hardware yet: run with SIM=1 anywhere (including the Mac itself) and it
generates a plausible exhaust-temperature curve.

Usage:
    SIM=1 python3 agent.py
"""

import os

SIM_MODE = os.environ.get("SIM") == "1"
DAEMON_URL = os.environ.get("DAEMON_URL", "http://localhost:4310")


def main() -> None:
    print(f"[pi-agent] skeleton — sim={'on' if SIM_MODE else 'off'}")
    print(f"[pi-agent] will report to {DAEMON_URL} (sensor loop lands in Stage 5)")


if __name__ == "__main__":
    main()
