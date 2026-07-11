"""DS18B20 digital probes over the Pi's 1-wire bus.

The kernel exposes each probe as a file. No ADC, no library, no SPI — the
Pi's w1 driver does the protocol work and we read text:

    /sys/bus/w1/devices/28-*/w1_slave

    72 01 4b 46 7f ff 0c 10 20 : crc=20 YES
    72 01 4b 46 7f ff 0c 10 20 t=23125     ← millidegrees C

Requires `dtoverlay=w1-gpio` in /boot/firmware/config.txt. See SETUP.md.
"""

# Keeps `X | None` annotations working on Python 3.9 (macOS system Python and
# older Pi OS images both ship 3.9).
from __future__ import annotations

import glob
from pathlib import Path

from .base import VentReading, VentSensor

W1_GLOB = "/sys/bus/w1/devices/28-*/w1_slave"

# A DS18B20 reads -55..+125 °C. Anything outside a sane vent range is a
# wiring fault (85.0 exactly is the classic power-on default = bad power).
MIN_PLAUSIBLE_C = -10.0
MAX_PLAUSIBLE_C = 120.0
POWER_ON_DEFAULT_C = 85.0


class DS18B20Sensor(VentSensor):
    """Reads every DS18B20 found on the 1-wire bus."""

    def __init__(self) -> None:
        self._paths = [Path(p) for p in sorted(glob.glob(W1_GLOB))]

    @staticmethod
    def available() -> bool:
        return len(glob.glob(W1_GLOB)) > 0

    def describe(self) -> str:
        return f"DS18B20 1-wire ({len(self._paths)} probes on the bus)"

    def _read_one(self, path: Path) -> VentReading | None:
        try:
            text = path.read_text()
        except OSError:
            return None  # probe yanked mid-read; skip this cycle

        # Line 1 ends in "YES" only when the CRC checks out. A "NO" means the
        # data is corrupt — a wiring/pull-up problem. Never trust it.
        lines = text.splitlines()
        if len(lines) < 2 or not lines[0].strip().endswith("YES"):
            return None

        marker = lines[1].find("t=")
        if marker == -1:
            return None

        try:
            temp_c = int(lines[1][marker + 2 :]) / 1000.0
        except ValueError:
            return None

        if not MIN_PLAUSIBLE_C <= temp_c <= MAX_PLAUSIBLE_C:
            return None
        if temp_c == POWER_ON_DEFAULT_C:
            # Exact 85.0 = sensor reset without a real conversion. Almost
            # always insufficient power on the parasitic line.
            return None

        # Directory name is the probe's unique factory ROM id — stable across
        # reboots, so the dashboard can name each vent position consistently.
        return VentReading(
            probe_id=path.parent.name,
            temp_c=round(temp_c, 2),
            source="ds18b20",
        )

    def read(self) -> list[VentReading]:
        readings = [self._read_one(p) for p in self._paths]
        return [r for r in readings if r is not None]
