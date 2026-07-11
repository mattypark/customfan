"""Sensor interface shared by every vent-temperature source.

DS18B20 (Stage 5) and MCP3008 thermistors (Stage 6) both implement this, so
the agent loop never learns which hardware is actually attached.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class VentReading:
    """One probe, one moment."""

    probe_id: str
    temp_c: float
    source: str  # "ds18b20" | "thermistor" | "sim"


class VentSensor(ABC):
    """A source of one or more vent-temperature probes."""

    @abstractmethod
    def read(self) -> list[VentReading]:
        """Return the current reading for every probe. Never raises on a
        single bad probe — that probe is simply omitted."""

    @abstractmethod
    def describe(self) -> str:
        """Human-readable summary for startup logging."""
