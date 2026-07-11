import { describe, expect, test } from 'vitest';
import { decideKill } from '../src/watchdog/killPolicy.js';
import { DEFAULT_CONFIG, type WatchdogConfig } from '../src/watchdog/config.js';

const base: WatchdogConfig = { ...DEFAULT_CONFIG, protectedPatterns: [] };
const armed: WatchdogConfig = { ...base, killEnabled: true, dryRun: false };

describe('decideKill — absolute guards (ignore config)', () => {
  test('never touches pid 1 even fully armed', () => {
    expect(decideKill(1, '/sbin/launchd', armed).verdict).toBe('protected');
  });

  test('never touches itself', () => {
    expect(decideKill(process.pid, '/anything', armed).verdict).toBe(
      'protected',
    );
  });

  test('never touches system-critical names, any casing', () => {
    for (const cmd of [
      '/System/Library/.../WindowServer',
      'kernel_task',
      '/usr/bin/finder'.replace('/usr/bin/', ''), // "finder" lowercase
    ]) {
      expect(decideKill(9999, cmd, armed).verdict).toBe('protected');
    }
  });

  test('never touches system path prefixes', () => {
    expect(decideKill(9999, '/System/Library/CoreServices/x', armed).verdict).toBe('protected');
    expect(decideKill(9999, '/usr/libexec/syspolicyd', armed).verdict).toBe('protected');
    expect(decideKill(9999, '/sbin/mount_apfs', armed).verdict).toBe('protected');
  });
});

describe('decideKill — user config', () => {
  test('user protectedPatterns match case-insensitively', () => {
    const cfg = { ...armed, protectedPatterns: ['terminal'] };
    const d = decideKill(9999, '/Applications/Terminal.app/x', cfg);
    expect(d.verdict).toBe('protected');
  });

  test('killEnabled=false → disabled (log only)', () => {
    const d = decideKill(9999, '/Applications/Leaky.app/leaky', base);
    expect(d.verdict).toBe('disabled');
  });

  test('dryRun=true → dry-run even with killEnabled', () => {
    const cfg = { ...base, killEnabled: true, dryRun: true };
    const d = decideKill(9999, '/Applications/Leaky.app/leaky', cfg);
    expect(d.verdict).toBe('dry-run');
  });

  test('fully armed + unprotected user app → kill', () => {
    const d = decideKill(9999, '/Applications/Leaky.app/leaky', armed);
    expect(d.verdict).toBe('kill');
  });
});
