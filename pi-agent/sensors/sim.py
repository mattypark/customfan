"""Simulated vent probes — lets the whole pipeline run with no Pi, no wiring.

Models what an exhaust vent actually does: sits well above room temperature,
rises when the Mac works hard, and lags behind the CPU because aluminum and
air take time to heat. Probes further from the vent read cooler.
"""

from __future__ import annotations

import math
import random
import time

from .base import VentReading, VentSensor

AMBIENT_C = 23.0
# Exhaust air runs this much above ambient at full tilt.
MAX_RISE_C = 22.0
# Thermal mass: the vent chases its target slowly. 0..1, lower = more lag.
CHASE_RATE = 0.08


class SimVentSensor(VentSensor):
    def __init__(self, probe_count: int = 3) -> None:
        self._probe_count = probe_count
        # Each probe sits a different distance from the exhaust, so each
        # sees a different fraction of the heat.
        self._coupling = [1.0, 0.72, 0.45][:probe_count]
        self._temps = [AMBIENT_C + 4 for _ in range(probe_count)]
        self._t0 = time.time()

    def describe(self) -> str:
        return f"simulated ({self._probe_count} probes, no hardware)"

    def read(self) -> list[VentReading]:
        # Slow duty cycle: the machine gets busy, then idles. ~3 min period.
        elapsed = time.time() - self._t0
        duty = (math.sin(elapsed / 30.0) + 1) / 2  # 0..1
        load = min(1.0, max(0.0, duty + random.uniform(-0.12, 0.12)))

        out: list[VentReading] = []
        for i in range(self._probe_count):
            target = AMBIENT_C + load * MAX_RISE_C * self._coupling[i]
            # Chase the target — this is the thermal lag that makes vent temp
            # a *trailing* signal vs the CPU's instantaneous die temp.
            self._temps[i] += (target - self._temps[i]) * CHASE_RATE
            noise = random.uniform(-0.15, 0.15)
            out.append(
                VentReading(
                    probe_id=f"sim-probe-{i}",
                    temp_c=round(self._temps[i] + noise, 2),
                    source="sim",
                )
            )
        return out
