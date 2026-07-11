import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const LOG_PATH = join(DATA_DIR, 'actions.jsonl');

export interface ActionEntry {
  at: number;
  kind: 'leak' | 'frozen';
  pid: number;
  command: string;
  verdict: string;
  reason: string;
  detail: Record<string, unknown>;
  outcome?: string;
}

/** Recent entries kept in memory so the API doesn't re-read the file. */
const recent: ActionEntry[] = [];
const RECENT_MAX = 200;

export async function logAction(entry: ActionEntry): Promise<void> {
  recent.push(entry);
  if (recent.length > RECENT_MAX) recent.shift();

  try {
    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    console.error('[customfan] action log write failed:', err);
  }
}

export function recentActions(limit = 50): ActionEntry[] {
  return recent.slice(-limit).reverse();
}

/** Load persisted history on boot so restarts don't blank the log feed. */
export async function warmActionLog(): Promise<void> {
  try {
    const raw = await readFile(LOG_PATH, 'utf8');
    const lines = raw.trim().split('\n').slice(-RECENT_MAX);
    for (const line of lines) {
      try {
        recent.push(JSON.parse(line) as ActionEntry);
      } catch {
        // skip corrupt line
      }
    }
  } catch {
    // no log yet — fine
  }
}
