import { useEffect, useRef, useState } from 'react';
import type { StatsFrame } from '../lib/types';

const WS_URL = import.meta.env.VITE_DAEMON_WS ?? 'ws://localhost:4310/ws';
const RECONNECT_MS = 2000;
/** ~2 min of history at the daemon's 2s broadcast rate. */
const HISTORY_LENGTH = 60;

export type ConnectionState = 'connecting' | 'live' | 'lost';

export interface FeedState {
  frame: StatsFrame | null;
  tempHistory: number[];
  fanHistory: number[];
  connection: ConnectionState;
}

/**
 * Live WebSocket feed from the daemon. Reconnects on drop; keeps a rolling
 * temp/fan history locally so the charts survive a reconnect.
 */
export function useDaemonFeed(): FeedState {
  const [frame, setFrame] = useState<StatsFrame | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [tempHistory, setTempHistory] = useState<number[]>([]);
  const [fanHistory, setFanHistory] = useState<number[]>([]);
  const unmounted = useRef(false);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      socket = new WebSocket(WS_URL);

      socket.onopen = () => setConnection('live');

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        if (msg.type !== 'stats') return;

        const next = msg as StatsFrame;
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

  return { frame, tempHistory, fanHistory, connection };
}
