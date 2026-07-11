import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProcessSample, ProcessSummary } from '../types.js';
import { RingBuffer } from './ringBuffer.js';

const execFileP = promisify(execFile);

/** Override with SAMPLE_MS env for fast local watchdog testing. */
const SAMPLE_INTERVAL_MS = Number(process.env.SAMPLE_MS ?? 5000);
/** ~5 min of history per PID at 5s intervals — enough for leak-slope math. */
const SAMPLES_PER_PID = 60;
const PS_TIMEOUT_MS = 4000;
const PS_MAX_BUFFER = 8 * 1024 * 1024;

const history = new Map<number, RingBuffer<ProcessSample>>();

/** `ps` snapshot of every process: pid, resident memory, cpu%, elapsed, command. */
async function snapshot(): Promise<ProcessSample[]> {
  const { stdout } = await execFileP(
    'ps',
    ['-axo', 'pid=,rss=,%cpu=,etime=,stat=,comm='],
    { timeout: PS_TIMEOUT_MS, maxBuffer: PS_MAX_BUFFER },
  );

  const now = Date.now();
  const samples: ProcessSample[] = [];

  for (const line of stdout.split('\n')) {
    const m = line.match(
      /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(.+)$/,
    );
    if (!m) continue;
    samples.push({
      pid: Number(m[1]),
      rssKb: Number(m[2]),
      cpuPercent: Number(m[3]),
      etime: m[4] as string,
      stat: m[5] as string,
      command: (m[6] as string).trim(),
      sampledAt: now,
    });
  }
  return samples;
}

function record(samples: ProcessSample[]): void {
  const livePids = new Set(samples.map((s) => s.pid));

  // Evict PIDs that died — their history is no longer actionable.
  for (const pid of history.keys()) {
    if (!livePids.has(pid)) history.delete(pid);
  }

  for (const sample of samples) {
    let buf = history.get(sample.pid);
    if (!buf) {
      buf = new RingBuffer<ProcessSample>(SAMPLES_PER_PID);
      history.set(sample.pid, buf);
    }
    buf.push(sample);
  }
}

async function sampleOnce(): Promise<void> {
  try {
    record(await snapshot());
  } catch (err) {
    console.error('[customfan] process sample failed:', err);
  }
}

export function startProcessSampling(): void {
  void sampleOnce();
  setInterval(() => void sampleOnce(), SAMPLE_INTERVAL_MS);
  console.log(`[customfan] process sampling every ${SAMPLE_INTERVAL_MS}ms`);
}

/** Latest state of every tracked process, for ranking and display. */
export function currentProcesses(): ProcessSummary[] {
  const out: ProcessSummary[] = [];
  for (const [pid, buf] of history) {
    const s = buf.latest;
    if (!s) continue;
    out.push({
      pid,
      command: s.command,
      cpuPercent: s.cpuPercent,
      rssMb: Math.round((s.rssKb / 1024) * 10) / 10,
      sampleCount: buf.size,
    });
  }
  return out;
}

export function topByCpu(limit: number): ProcessSummary[] {
  return [...currentProcesses()]
    .sort((a, b) => b.cpuPercent - a.cpuPercent)
    .slice(0, limit);
}

export function topByMemory(limit: number): ProcessSummary[] {
  return [...currentProcesses()]
    .sort((a, b) => b.rssMb - a.rssMb)
    .slice(0, limit);
}

/** Full sample history for one PID — Stage 3's leak detector reads this. */
export function samplesFor(pid: number): ProcessSample[] {
  return history.get(pid)?.toArray() ?? [];
}

/** All tracked PIDs — Stage 3 iterates this for leak scans. */
export function trackedPids(): number[] {
  return [...history.keys()];
}
