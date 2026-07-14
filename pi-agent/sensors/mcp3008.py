"""MCP3008 10-bit ADC over the Pi's SPI bus.

The Pi has no analog input — thermistors are analog. The MCP3008 bridges that
gap: 8 channels, 10 bits, SPI.

Protocol (from the datasheet): send three bytes, get three back.

    byte 0: 0x01                  start bit
    byte 1: 0x80 | (ch << 4)      single-ended mode, channel select
    byte 2: 0x00                  don't care — clocks the result out

    result: 10 bits split across the low 2 bits of reply[1] and all of reply[2]
            counts = ((reply[1] & 0x03) << 8) | reply[2]

`spidev` only exists on a Pi, so the import is guarded — this module imports
cleanly on a Mac and reports itself unavailable.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from .thermistor_math import ADC_MAX_COUNTS, temp_to_counts

SPI_BUS = 0
SPI_DEVICE = 0
SPI_MAX_HZ = 1_350_000  # MCP3008 max at 3.3V per datasheet
MCP3008_CHANNELS = 8


class Adc(ABC):
    """Anything that can hand back raw counts for a channel."""

    @abstractmethod
    def read_counts(self, channel: int) -> int:
        """Raw 0..1023 for one channel."""

    @abstractmethod
    def describe(self) -> str:
        ...

    def close(self) -> None:
        """Release the bus. Default: nothing to release."""


class MCP3008(Adc):
    """Real hardware over SPI."""

    def __init__(self) -> None:
        import spidev  # noqa: PLC0415 — Pi-only, must stay lazy

        self._spi = spidev.SpiDev()
        self._spi.open(SPI_BUS, SPI_DEVICE)
        self._spi.max_speed_hz = SPI_MAX_HZ

    @staticmethod
    def available() -> bool:
        """True only when spidev imports AND the SPI device node exists."""
        try:
            import spidev  # noqa: F401, PLC0415
        except ImportError:
            return False

        from pathlib import Path

        return Path(f"/dev/spidev{SPI_BUS}.{SPI_DEVICE}").exists()

    def describe(self) -> str:
        return f"MCP3008 on SPI{SPI_BUS}.{SPI_DEVICE} @ {SPI_MAX_HZ // 1000} kHz"

    def read_counts(self, channel: int) -> int:
        if not 0 <= channel < MCP3008_CHANNELS:
            raise ValueError(f"MCP3008 has channels 0-7, got {channel}")

        reply = self._spi.xfer2([0x01, 0x80 | (channel << 4), 0x00])
        counts = ((reply[1] & 0x03) << 8) | reply[2]

        # Should be structurally impossible from a 10-bit part; if it happens,
        # SPI wiring or clock speed is wrong and every reading is suspect.
        if not 0 <= counts <= ADC_MAX_COUNTS:
            raise OSError(f"MCP3008 returned {counts}, outside 0-{ADC_MAX_COUNTS}")

        return counts

    def close(self) -> None:
        self._spi.close()


class SimAdc(Adc):
    """Simulated MCP3008.

    Deliberately fakes *raw counts*, not temperatures. The production
    Steinhart–Hart / beta math then converts those counts back exactly as it
    would on hardware — so the conversion path under test is the same code
    that ships. Faking a temperature directly would test nothing.
    """

    def __init__(self, channel_temps_c: dict[int, float]) -> None:
        self._channel_temps_c = channel_temps_c

    def describe(self) -> str:
        chans = ",".join(str(c) for c in sorted(self._channel_temps_c))
        return f"simulated MCP3008 (channels {chans}, no hardware)"

    def set_temp(self, channel: int, temp_c: float) -> None:
        self._channel_temps_c[channel] = temp_c

    def read_counts(self, channel: int) -> int:
        temp_c = self._channel_temps_c.get(channel)
        if temp_c is None:
            # An unwired channel floats. Return a rail so the production code
            # path raises ThermistorError, exactly as it would in reality.
            return 0
        return temp_to_counts(temp_c)
