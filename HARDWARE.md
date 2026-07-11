# customfan — Hardware Order List (Amazon)

Nothing here blocks development. Stages 1–4 run 100% in sim mode.
Order whenever ready; Stage 5 is where the Pi first gets used.

## Core (required for Stage 5)

| Item | What to search on Amazon | ~Price | Why |
|------|--------------------------|--------|-----|
| Raspberry Pi Zero 2 W | "Raspberry Pi Zero 2 W kit" (kit includes headers) | $25–35 | Small enough to sit on the exhaust vent. Wi-Fi built in. |
| microSD card 32GB | "SanDisk 32GB microSD A1" | $8 | Pi OS boot disk |
| Pi power supply | "Raspberry Pi micro USB power supply 5V 2.5A" | $10 | Stable power (phone chargers cause brownouts) |
| DS18B20 waterproof probes | "DS18B20 waterproof temperature sensor 3 pack" | $10 | Digital 1-wire temp probes — first working sensor path, no ADC needed. Most 3-packs include the 4.7kΩ pull-up resistors. |
| Jumper wires | "GPIO jumper wires female to male kit" | $7 | Pi header → breadboard |
| Breadboard | "400 point solderless breadboard 2 pack" | $7 | No-solder wiring |

**Core subtotal: ~$70**

## Analog upgrade (required for Stage 6 — the real-thermistor path)

| Item | What to search on Amazon | ~Price | Why |
|------|--------------------------|--------|-----|
| 10k NTC thermistors | "10K NTC thermistor 3950 10 pack" | $7 | The actual thermistors — analog, need an ADC |
| MCP3008 ADC | "MCP3008 ADC DIP" | $8 | Pi has no analog input; this reads the thermistor voltage divider over SPI |
| Resistor kit | "resistor assortment kit 1/4W" (need 10kΩ + 4.7kΩ) | $8 | Voltage divider halves + 1-wire pull-up spares |

**Analog subtotal: ~$23**

## Optional

| Item | ~Price | Why |
|------|--------|-----|
| Pi Zero case | $8 | Protects the Pi sitting on the vent |
| GPIO breakout ("T-cobbler" for 40-pin) | $10 | Cleaner breadboard wiring |

## Notes

- If the Pi Zero 2 W kit doesn't include a **soldered header**, search
  "Pi Zero 2 W with header" or add a hammer-on header — thermistor wiring
  needs the 40-pin header.
- DS18B20 probes are the fast win (3 wires, no ADC). The thermistor + MCP3008
  path is the "real EE" upgrade — both are planned, Stage 5 then Stage 6.
- Total spend both paths + optional: **~$110**.
