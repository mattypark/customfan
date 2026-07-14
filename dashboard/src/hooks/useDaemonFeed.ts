import { useEffect, useRef, useState } from 'react';
import type { StatsFrame } from '../lib/types';
import { buildDemoFrame } from '../lib/demoFeed';

const WS_URL = import.meta.env.VITE_DAEMON_WS ?? 'ws://localhost:4310/ws';
const RECONNECT_MS = 2000;
/** ~2 min of history at the daemon's 2s broadcast rate. */
const HISTORY_LENGTH = 60;
const FRAME_INTERVAL_MS = 2000;

/**
 * Demo mode runs the simulation in the browser instead of connecting to a
 * daemon. The deployed build sets VITE_DEMO=1, because the real daemon reads
 * Mac hardware and cannot run on a static host.
 */
const DEMO_MODE =
  import.meta.env.VITE_DEMO === '1' ||
  new URLSearchParams(window.location.search).has('demo');

export type ConnectionState = 'connecting' | 'live' | 'lost' | 'demo';

export interface FeedState {
  frame: StatsFrame | null;
  tempHistory: number[];
  fanHistory: number[];
  connection: ConnectionState;
  isDemo: boolean;
  /** When the demo loop started — used to label the current phase. */
  demoStartedAt: number;
}

export function useDaemonFeed(): FeedState {
  const [frame, setFrame] = useState<StatsFrame | null>(null);
  const [connection, setConnection] = useState<ConnectionState>(
    DEMO_MODE ? 'demo' : 'connecting',
  );
  const [tempHistory, setTempHistory] = useState<number[]>([]);
  const [fanHistory, setFanHistory] = useState<number[]>([]);
  const unmounted = useRef(false);
  const demoStartedAt = useRef(Date.now());

  /** Shared by both sources — a frame is a frame, wherever it came from. */
  const absorb = (next: StatsFrame) => {
    setFrame(next);

    const t = next.thermals?.cpuTempC;
    const f = next.thermals?.fanRpm;
    if (typeof t === 'number') {
      setTempHistory((h) => [...h, t].slice(-HISTORY_LENGTH));
    }
    if (typeof f === 'number') {
      setFanHistory((h) => [...h, f].slice(-HISTORY_LENGTH));
    }
  };

  useEffect(() => {
    if (DEMO_MODE) {
      // Seed the charts with recent history so the page doesn't open on an
      // empty trace and make the visitor wait two minutes to see a line.
      const start = demoStartedAt.current;
      const backfill: StatsFrame[] = [];
      for (let i = HISTORY_LENGTH; i > 0; i--) {
        backfill.push(buildDemoFrame(start + i * FRAME_INTERVAL_MS));
      }
      setTempHistory(
        backfill.map((f) => f.thermals?.cpuTempC ?? 0),
      );
      setFanHistory(backfill.map((f) => f.thermals?.fanRpm ?? 0));

      absorb(buildDemoFrame(start));
      const id = setInterval(
        () => absorb(buildDemoFrame(start)),
        FRAME_INTERVAL_MS,
      );
      return () => clearInterval(id);
    }

    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      socket = new WebSocket(WS_URL);

      socket.onopen = () => setConnection('live');

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        if (msg.type !== 'stats') return;
        absorb(msg as StatsFrame);
      };

      socket.onclose = () => {
        if (unmounted.current) return;
        setConnection('lost');
        retry = setTimeout(connect, RECONNECT_MS);
      };
    };

    connect();

    return () => {
      unmounted.current = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, []);

  return {
    frame,
    tempHistory,
    fanHistory,
    connection,
    isDemo: DEMO_MODE,
    demoStartedAt: demoStartedAt.current,
  };
}
