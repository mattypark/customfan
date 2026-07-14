"""Calibrate analog thermistors against a known-good reference.

A raw 10k NTC read with the datasheet beta value lands within roughly ±1 °C.
Fitting Steinhart–Hart coefficients from three real measurements gets you to
about ±0.1 °C — and costs nothing but a few minutes.

The reference can be either:
  * a DS18B20 probe on the same bus (factory-calibrated, ±0.5 °C), or
  * a thermometer and your own hands.

Procedure — three points, spread wide. Clustered points make the fit singular.

    1. Ice water .......... ~0 °C   (stir; wait for it to settle)
    2. Room ............... ~22 °C
    3. Warm ............... ~45 °C  (hold the probe against a mug of hot water,
                                     or tape it to the Mac's vent under load)

Usage:
    python3 calibrate.py                  # real MCP3008
    SIM=1 python3 calibrate.py            # rehearse the whole flow, no hardware
    python3 calibrate.py --channels 0,1,2

Writes calibration.json, which the agent picks up automatically on next start.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from pathlib import Path

from sensors.mcp3008 import MCP3008, Adc, SimAdc
from sensors.thermistor_math import (
    ThermistorError,
    counts_to_resistance,
    solve_steinhart_hart,
)

CALIBRATION_PATH = Path(__file__).parent / "calibration.json"
SAMPLES_PER_POINT = 20
SAMPLE_GAP_SEC = 0.1
# Fit quality gate: how far the fitted curve may miss its own input points.
MAX_RESIDUAL_C = 0.5

POINTS = [
    ("ice water", 0.0),
    ("room temperature", 22.0),
    ("warm (hot mug / vent under load)", 45.0),
]


def median_resistance(adc: Adc, channel: int) -> float:
    """Median of several samples — one bad SPI read can't skew the fit."""
    resistances: list[float] = []

    for _ in range(SAMPLES_PER_POINT):
        try:
            counts = adc.read_counts(channel)
            resistances.append(counts_to_resistance(counts))
        except (ThermistorError, OSError) as err:
            print(f"  ! channel {channel}: {err}", file=sys.stderr)
        time.sleep(SAMPLE_GAP_SEC)

    if not resistances:
        raise ThermistorError(
            f"channel {channel} produced no valid samples — check wiring"
        )

    return statistics.median(resistances)


def calibrate_channel(adc: Adc, channel: int, sim: bool) -> dict[str, float]:
    print(f"\n─── channel {channel} ───")
    measurements: list[tuple[float, float]] = []

    for label, suggested_c in POINTS:
        print(f"\n  Point: {label} (~{suggested_c} °C)")
        print(f"  Place probe on channel {channel} into the {label}.")

        if sim:
            # Rehearsal mode: drive the sim ADC to this point instead of
            # waiting on a human with a cup of ice.
            if isinstance(adc, SimAdc):
                adc.set_temp(channel, suggested_c)
            actual_c = suggested_c
            print(f"  [SIM] pretending the probe reads {actual_c} °C")
        else:
            input("  Press Enter once the reading has settled (~60s)... ")
            entered = input(
                f"  Reference temperature in °C [{suggested_c}]: "
            ).strip()
            actual_c = float(entered) if entered else suggested_c

        r_ohms = median_resistance(adc, channel)
        print(f"  → {r_ohms:,.0f} Ω at {actual_c} °C")
        measurements.append((r_ohms, actual_c))

    coeffs = solve_steinhart_hart(measurements)

    # Sanity check: a good fit reproduces its own inputs. If it can't, the
    # points were too close together or one reading was bad — and shipping
    # those coefficients would silently corrupt every future reading.
    from sensors.thermistor_math import resistance_to_temp_steinhart

    worst = 0.0
    for r_ohms, expected_c in measurements:
        got_c = resistance_to_temp_steinhart(r_ohms, coeffs)
        worst = max(worst, abs(got_c - expected_c))

    print(f"\n  A={coeffs.a:.6e}  B={coeffs.b:.6e}  C={coeffs.c:.6e}")
    print(f"  worst residual against its own points: {worst:.3f} °C")

    if worst > MAX_RESIDUAL_C:
        raise ValueError(
            f"channel {channel} fit is bad ({worst:.2f} °C residual). "
            "Your three points were probably too close together, or one "
            "reading drifted. Redo with a wider spread."
        )

    return {"a": coeffs.a, "b": coeffs.b, "c": coeffs.c}


def main() -> None:
    parser = argparse.ArgumentParser(description="Calibrate NTC thermistors")
    parser.add_argument(
        "--channels",
        default="0,1,2",
        help="MCP3008 channels to calibrate (default: 0,1,2)",
    )
    args = parser.parse_args()

    channels = [int(c) for c in args.channels.split(",")]
    sim = os.environ.get("SIM") == "1"

    if sim:
        adc: Adc = SimAdc({ch: 22.0 for ch in channels})
        print("[calibrate] SIM mode — rehearsing the flow with no hardware.")
        print("[calibrate] The coefficients produced will be real math on fake")
        print("[calibrate] counts. Do not ship them; recalibrate on the Pi.")
    elif MCP3008.available():
        adc = MCP3008()
    else:
        print(
            "[calibrate] No MCP3008 found. Enable SPI (`sudo raspi-config` → "
            "Interface Options → SPI), install spidev, and check wiring.\n"
            "[calibrate] To rehearse the flow with no hardware: SIM=1 python3 "
            "calibrate.py",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"[calibrate] {adc.describe()}")
    print(f"[calibrate] calibrating channels: {channels}")

    try:
        results = {
            str(ch): calibrate_channel(adc, ch, sim) for ch in channels
        }
    finally:
        adc.close()

    payload = {
        "note": "Steinhart-Hart coefficients. Regenerate with calibrate.py.",
        "simulated": sim,
        "channels": results,
    }
    CALIBRATION_PATH.write_text(json.dumps(payload, indent=2) + "\n")

    print(f"\n[calibrate] wrote {CALIBRATION_PATH}")
    print("[calibrate] the agent will use these automatically on next start.")


if __name__ == "__main__":
    main()
