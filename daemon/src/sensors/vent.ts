/**
 * Vent-temperature store. The Pi agent POSTs here; the daemon fuses the
 * readings with its own CPU thermals.
 *
 * The whole point of this sensor is physical: the CPU can report a fine die
 * temperature while the exhaust is baking because the vent is blocked or the
 * fan has failed. Comparing the two is what customfan can do that a
 * software-only monitor cannot.
 */

export interface VentProbe {
  probeId: string;
  tempC: number;
  source: string;
  receivedAt: number;
}

export interface VentState {
  probes: VentProbe[];
  agentId: string | null;
  /** Hottest live probe — the number that actually matters. */
  hottestC: number | null;
  lastSeenAt: number | null;
  /** True when the agent has gone quiet: readings are no longer trustworthy. */
  stale: boolean;
}

/** No POST for this long and we stop pretending the readings are current. */
const STALE_AFTER_MS = 10_000;

const MIN_PLAUSIBLE_C = -10;
const MAX_PLAUSIBLE_C = 120;

let probes = new Map<string, VentProbe>();
let agentId: string | null = null;
let lastSeenAt: number | null = null;

export interface VentPost {
  agentId?: unknown;
  readings?: unknown;
}

/**
 * Validate and store a POST from the Pi. Returns how many readings were
 * accepted; a malformed body is rejected rather than half-applied.
 */
export function ingestVentPost(body: VentPost): { accepted: number } | null {
  if (!Array.isArray(body.readings)) return null;

  const now = Date.now();
  const next: VentProbe[] = [];

  for (const raw of body.readings) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;

    const probeId = r.probeId;
    const tempC = r.tempC;
    const source = r.source;

    if (typeof probeId !== 'string' || probeId.length === 0) continue;
    if (typeof tempC !== 'number' || !Number.isFinite(tempC)) continue;
    if (tempC < MIN_PLAUSIBLE_C || tempC > MAX_PLAUSIBLE_C) continue;

    next.push({
      probeId,
      tempC,
      source: typeof source === 'string' ? source : 'unknown',
      receivedAt: now,
    });
  }

  if (next.length === 0) return null;

  // Replace wholesale: a probe the agent no longer reports is unplugged, and
  // keeping its last value on screen would be a lie.
  probes = new Map(next.map((p) => [p.probeId, p]));
  agentId = typeof body.agentId === 'string' ? body.agentId : null;
  lastSeenAt = now;

  return { accepted: next.length };
}

export function getVentState(): VentState {
  const stale =
    lastSeenAt === null || Date.now() - lastSeenAt > STALE_AFTER_MS;

  const list = [...probes.values()];

  return {
    probes: list,
    agentId,
    hottestC:
      stale || list.length === 0
        ? null
        : Math.max(...list.map((p) => p.tempC)),
    lastSeenAt,
    stale,
  };
}
