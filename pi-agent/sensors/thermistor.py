"""Analog NTC thermistors read through an MCP3008 ADC.

Implements the same VentSensor interface as the DS18B20 path, so the agent
loop is identical whichever hardware is attached.

Calibration coefficients, if present, are loaded from calibration.json (see
calibrate.py). Without them we fall back to the datasheet beta value, which is
good to about ±1 °C — fine for spotting a blocked vent, not for lab work.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .base import VentReading, VentSensor
from .mcp3008 import MCP3008, Adc, SimAdc
from .thermistor_math import (
    DEFAULT_BETA,
    SteinhartCoefficients,
    ThermistorError,
    counts_to_resistance,
    resistance_to_temp_beta,
    resistance_to_temp_steinhart,
)

CALIBRATION_PATH = Path(__file__).parent.parent / "calibration.json"

MIN_PLAUSIBLE_C = -10.0
MAX_PLAUSIBLE_C = 120.0


def load_calibration() -> dict[int, SteinhartCoefficients]:
    """Per-channel Steinhart–Hart coefficients, if calibrate.py has been run.

    Missing or malformed file is not an error — it just means beta mode.
    """
    try:
        raw = json.loads(CALIBRATION_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return {}

    out: dict[int, SteinhartCoefficients] = {}
    for channel, coeffs in raw.get("channels", {}).items():
        try:
            out[int(channel)] = SteinhartCoefficients(
                a=float(coeffs["a"]),
                b=float(coeffs["b"]),
                c=float(coeffs["c"]),
            )
        except (KeyError, TypeError, ValueError):
            print(
                f"[pi-agent] calibration for channel {channel} is malformed; "
                "using beta fallback for it",
                file=sys.stderr,
            )
    return out


class ThermistorSensor(VentSensor):
    def __init__(
        self,
        adc: Adc,
        channels: list[int],
        beta: float = DEFAULT_BETA,
    ) -> None:
        self._adc = adc
        self._channels = channels
        self._beta = beta
        self._calibration = load_calibration()

    @staticmethod
    def available() -> bool:
        return MCP3008.available()

    def describe(self) -> str:
        calibrated = sum(1 for ch in self._channels if ch in self._calibration)
        mode = (
            f"{calibrated}/{len(self._channels)} channels Steinhart–Hart calibrated"
            if calibrated
            else f"beta={self._beta:.0f} (uncalibrated — run calibrate.py)"
        )
        return f"NTC thermistors via {self._adc.describe()} · {mode}"

    def _read_channel(self, channel: int) -> VentReading | None:
        try:
            counts = self._adc.read_counts(channel)
            r_ohms = counts_to_resistance(counts)

            coeffs = self._calibration.get(channel)
            temp_c = (
                resistance_to_temp_steinhart(r_ohms, coeffs)
                if coeffs
                else resistance_to_temp_beta(r_ohms, beta=self._beta)
            )
        except ThermistorError as err:
            # Open circuit, short, rail reading. Skip the probe rather than
            # publish a number the hardware never actually measured.
            print(f"[pi-agent] channel {channel}: {err}", file=sys.stderr)
            return None
        except OSError as err:
            print(f"[pi-agent] channel {channel}: SPI failure: {err}", file=sys.stderr)
            return None

        if not MIN_PLAUSIBLE_C <= temp_c <= MAX_PLAUSIBLE_C:
            print(
                f"[pi-agent] channel {channel}: {temp_c:.1f}°C is outside the "
                "plausible range — check wiring and R_fixed",
                file=sys.stderr,
            )
            return None

        return VentReading(
            probe_id=f"thermistor-ch{channel}",
            temp_c=round(temp_c, 2),
            source="thermistor",
        )

    def read(self) -> list[VentReading]:
        readings = [self._read_channel(ch) for ch in self._channels]
        return [r for r in readings if r is not None]


def build_sim_thermistor(channels: list[int]) -> ThermistorSensor:
    """Simulated thermistor stack — same conversion math, fake raw counts."""
    # Three probes at decreasing coupling to the exhaust, like the DS18B20 sim.
    seed = {ch: temp for ch, temp in zip(channels, [41.0, 35.5, 29.0])}
    return ThermistorSensor(adc=SimAdc(seed), channels=channels)
