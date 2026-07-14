"""Thermistor physics: ADC counts → resistance → temperature.

Pure functions, no hardware, no I/O. Every step here is unit-tested, because
a wrong constant produces a *plausible-looking* wrong temperature — the worst
kind of bug in a thermal safety tool.

The signal chain
----------------

    3V3 ──[ NTC thermistor ]──┬──[ R_fixed 10kΩ ]── GND
                              │
                              └── MCP3008 CH0

The ADC reports where the junction voltage sits between GND and Vref. Because
Vref and the divider's supply are the *same* 3V3 rail, supply sag cancels out
of the ratio entirely — we never need to know the actual voltage, only the
fraction. That's why this circuit is stable on a Pi whose 3V3 rail wobbles.

    ratio = counts / 1023 = R_fixed / (R_ntc + R_fixed)
    →  R_ntc = R_fixed * (1/ratio - 1)

Resistance → temperature
------------------------

Two models, both supported:

* **Beta** — one datasheet constant (B=3950 for the common 10k NTC). Good to
  roughly ±1 °C over a modest span. This is the default: it needs nothing but
  the numbers printed on the Amazon listing.

* **Steinhart–Hart** — three coefficients (A, B, C) fitted from three known
  (resistance, temperature) points. Good to ~±0.1 °C across a wide span. Use
  `solve_steinhart_hart()` to derive the coefficients from a calibration run
  against a DS18B20.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# MCP3008 is a 10-bit ADC: 1024 codes, full-scale count is 1023.
ADC_MAX_COUNTS = 1023

KELVIN_OFFSET = 273.15

# Datasheet values for the standard 10k NTC 3950 sold in hobby packs.
DEFAULT_R_FIXED_OHMS = 10_000.0
DEFAULT_R_NOMINAL_OHMS = 10_000.0  # resistance at T_nominal
DEFAULT_T_NOMINAL_C = 25.0
DEFAULT_BETA = 3950.0

# Calibration points closer together than this can't define a curve. Ice water
# to a hot mug is ~45 °C, so this is a low bar that only catches real mistakes.
MIN_CALIBRATION_SPAN_C = 15.0

# Numerical backstop. Well-spread points give |det| ~ 10¹; clustered ones give
# ~10⁻¹¹. Anything below this is degenerate however it got that way.
MIN_DETERMINANT = 1e-6


class ThermistorError(ValueError):
    """Reading is physically impossible — open circuit, short, or miswiring."""


@dataclass(frozen=True)
class SteinhartCoefficients:
    a: float
    b: float
    c: float


def counts_to_resistance(
    counts: int,
    r_fixed_ohms: float = DEFAULT_R_FIXED_OHMS,
) -> float:
    """ADC counts → thermistor resistance in ohms.

    Raises ThermistorError at the rails. Counts of 0 or 1023 don't mean
    "very hot" or "very cold" — they mean the divider is broken (a
    disconnected probe floats to one rail, a shorted one pins to the other).
    Reporting a temperature from a rail reading would be inventing data.
    """
    if counts <= 0:
        raise ThermistorError(
            "ADC reads 0 — thermistor open circuit or not connected"
        )
    if counts >= ADC_MAX_COUNTS:
        raise ThermistorError(
            f"ADC reads {ADC_MAX_COUNTS} (full scale) — thermistor shorted "
            "or fixed resistor missing"
        )

    ratio = counts / ADC_MAX_COUNTS
    return r_fixed_ohms * (1.0 / ratio - 1.0)


def resistance_to_temp_beta(
    r_ohms: float,
    beta: float = DEFAULT_BETA,
    r_nominal_ohms: float = DEFAULT_R_NOMINAL_OHMS,
    t_nominal_c: float = DEFAULT_T_NOMINAL_C,
) -> float:
    """Beta-parameter equation → °C.

        1/T = 1/T0 + (1/B) * ln(R / R0)      [T in kelvin]
    """
    if r_ohms <= 0:
        raise ThermistorError(f"non-physical resistance: {r_ohms} Ω")

    t_nominal_k = t_nominal_c + KELVIN_OFFSET
    inv_t = 1.0 / t_nominal_k + (1.0 / beta) * math.log(r_ohms / r_nominal_ohms)
    return 1.0 / inv_t - KELVIN_OFFSET


def resistance_to_temp_steinhart(
    r_ohms: float,
    coeffs: SteinhartCoefficients,
) -> float:
    """Steinhart–Hart equation → °C.

        1/T = A + B*ln(R) + C*ln(R)^3        [T in kelvin]
    """
    if r_ohms <= 0:
        raise ThermistorError(f"non-physical resistance: {r_ohms} Ω")

    ln_r = math.log(r_ohms)
    inv_t = coeffs.a + coeffs.b * ln_r + coeffs.c * ln_r**3

    if inv_t <= 0:
        raise ThermistorError("Steinhart–Hart produced a non-physical temperature")

    return 1.0 / inv_t - KELVIN_OFFSET


def solve_steinhart_hart(
    points: list[tuple[float, float]],
) -> SteinhartCoefficients:
    """Fit A, B, C from exactly three (resistance_ohms, temp_c) points.

    Steinhart–Hart is *linear* in its three coefficients, so three points give
    an exact 3x3 solve — no iteration, no curve fitting.

        [1  L1  L1³] [A]   [1/T1]
        [1  L2  L2³] [B] = [1/T2]      where L = ln(R), T in kelvin
        [1  L3  L3³] [C]   [1/T3]

    Solved by Cramer's rule so we stay in the standard library.

    Pick the three points spread across the range you care about — e.g. ice
    water (0 °C), room temperature, and the probe held against something warm.
    Clustered points make the matrix near-singular and the fit garbage.
    """
    if len(points) != 3:
        raise ValueError(f"need exactly 3 calibration points, got {len(points)}")

    temps = [t for _, t in points]
    span = max(temps) - min(temps)
    if span < MIN_CALIBRATION_SPAN_C:
        raise ValueError(
            f"calibration points span only {span:.1f} °C. Spread them across "
            f"at least {MIN_CALIBRATION_SPAN_C:.0f} °C (e.g. ice water, room, "
            "hot mug) — points this close cannot define a curve."
        )

    rows: list[list[float]] = []
    rhs: list[float] = []

    for r_ohms, temp_c in points:
        if r_ohms <= 0:
            raise ValueError(f"non-physical resistance in calibration: {r_ohms} Ω")
        ln_r = math.log(r_ohms)
        rows.append([1.0, ln_r, ln_r**3])
        rhs.append(1.0 / (temp_c + KELVIN_OFFSET))

    def det3(m: list[list[float]]) -> float:
        return (
            m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
        )

    def replace_column(m: list[list[float]], col: int, v: list[float]) -> list[list[float]]:
        return [
            [v[i] if j == col else m[i][j] for j in range(3)]
            for i in range(3)
        ]

    base = det3(rows)
    if abs(base) < MIN_DETERMINANT:
        raise ValueError(
            "calibration matrix is singular — two probes read nearly the same "
            "resistance. Check that each point actually settled before you "
            "recorded it."
        )

    a = det3(replace_column(rows, 0, rhs)) / base
    b = det3(replace_column(rows, 1, rhs)) / base
    c = det3(replace_column(rows, 2, rhs)) / base

    return SteinhartCoefficients(a=a, b=b, c=c)


def temp_to_counts(
    temp_c: float,
    beta: float = DEFAULT_BETA,
    r_fixed_ohms: float = DEFAULT_R_FIXED_OHMS,
    r_nominal_ohms: float = DEFAULT_R_NOMINAL_OHMS,
    t_nominal_c: float = DEFAULT_T_NOMINAL_C,
) -> int:
    """Inverse of the whole chain: °C → the ADC counts that would produce it.

    This is what lets the simulated ADC be honest — instead of faking a
    temperature, it fakes the *raw counts* a real MCP3008 would report, and
    the same production math converts them back. The conversion code under
    test is the identical code that runs on hardware.
    """
    t_k = temp_c + KELVIN_OFFSET
    t_nominal_k = t_nominal_c + KELVIN_OFFSET

    # Invert the beta equation for R.
    r_ohms = r_nominal_ohms * math.exp(beta * (1.0 / t_k - 1.0 / t_nominal_k))

    ratio = r_fixed_ohms / (r_ohms + r_fixed_ohms)
    counts = round(ratio * ADC_MAX_COUNTS)

    return max(1, min(ADC_MAX_COUNTS - 1, counts))
